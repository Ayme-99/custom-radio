const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const MOTOR_VOZ = ['EDGE', 'OPENAI', 'ELEVENLABS'];

const proyectoCreateSchema = z.object({
  nombre: z.string().trim().min(1),
  perfilId: z.string().uuid(),
  contexto: z.record(z.string(), z.unknown()).default({}),
  motorVoz: z.enum(MOTOR_VOZ).default('EDGE'),
  vozNombre: z.string().trim().min(1).optional(),
  vozRate: z.string().trim().min(1).optional(),
  vozPitch: z.string().trim().min(1).optional(),
});

// Nota: `estado` no es editable directamente por el cliente — lo hará avanzar
// el propio flujo de generación (guion/audio) más adelante (#10, #11).
const proyectoUpdateSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  perfilId: z.string().uuid().optional(),
  contexto: z.record(z.string(), z.unknown()).optional(),
  motorVoz: z.enum(MOTOR_VOZ).optional(),
  vozNombre: z.string().trim().min(1).nullable().optional(),
  vozRate: z.string().trim().min(1).nullable().optional(),
  vozPitch: z.string().trim().min(1).nullable().optional(),
});

async function perfilVisible(perfilId, usuarioId) {
  return prisma.perfilEmisora.findFirst({
    where: { id: perfilId, OR: [{ esPublico: true }, { creadoPorId: usuarioId }] },
  });
}

router.get('/', async (req, res, next) => {
  try {
    const proyectos = await prisma.proyecto.findMany({
      where: { usuarioId: req.usuarioId },
      orderBy: { ultimaActividad: 'desc' },
    });
    res.json({ proyectos });
  } catch (err) {
    next(err);
  }
});

async function findProyectoPropio(id, usuarioId, extra = {}) {
  return prisma.proyecto.findFirst({
    where: { id, usuarioId },
    ...extra,
  });
}

router.get('/:id', async (req, res, next) => {
  try {
    const proyecto = await findProyectoPropio(req.params.id, req.usuarioId, {
      include: { pistas: { orderBy: { orden: 'asc' } }, lineasGuion: { orderBy: { orden: 'asc' } } },
    });
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json({ proyecto });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = proyectoCreateSchema.parse(req.body);

    const perfil = await perfilVisible(data.perfilId, req.usuarioId);
    if (!perfil) {
      return res.status(400).json({ error: 'El perfil indicado no existe o no tienes acceso a él' });
    }

    const proyecto = await prisma.proyecto.create({
      data: { ...data, usuarioId: req.usuarioId },
    });
    res.status(201).json({ proyecto });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const existente = await findProyectoPropio(req.params.id, req.usuarioId);
    if (!existente) return res.status(404).json({ error: 'Proyecto no encontrado' });

    const data = proyectoUpdateSchema.parse(req.body);

    if (data.perfilId) {
      const perfil = await perfilVisible(data.perfilId, req.usuarioId);
      if (!perfil) {
        return res.status(400).json({ error: 'El perfil indicado no existe o no tienes acceso a él' });
      }
    }

    const proyecto = await prisma.proyecto.update({
      where: { id: existente.id },
      data: { ...data, ultimaActividad: new Date() },
    });
    res.json({ proyecto });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existente = await findProyectoPropio(req.params.id, req.usuarioId);
    if (!existente) return res.status(404).json({ error: 'Proyecto no encontrado' });

    // Sin cascade delete a nivel de schema: borramos primero lo dependiente
    // (pistas/guion, aun vacios en el MVP actual) para evitar el error de FK.
    await prisma.$transaction([
      prisma.pista.deleteMany({ where: { proyectoId: existente.id } }),
      prisma.lineaGuion.deleteMany({ where: { proyectoId: existente.id } }),
      prisma.proyecto.delete({ where: { id: existente.id } }),
    ]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
