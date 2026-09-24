const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const campoContextoSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'textarea', 'number', 'date', 'select']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

// Base sin valores por defecto: el update la usa tal cual (.partial()) para
// que un campo ausente en el body no se sobrescriba con su default; el create
// añade los .default() aparte, solo para ese schema.
const perfilBaseSchema = z.object({
  nombre: z.string().trim().min(1),
  tono: z.string().trim().min(1),
  camposContexto: z.array(campoContextoSchema),
  humorNegro: z.boolean(),
  plantillasBase: z.unknown().optional(),
  esPublico: z.boolean(),
});

const perfilCreateSchema = perfilBaseSchema.extend({
  camposContexto: z.array(campoContextoSchema).default([]),
  humorNegro: z.boolean().default(false),
  esPublico: z.boolean().default(false),
});

const perfilUpdateSchema = perfilBaseSchema.partial();

function visibleParaUsuario(usuarioId) {
  return { OR: [{ esPublico: true }, { creadoPorId: usuarioId }] };
}

router.get('/', async (req, res, next) => {
  try {
    const perfiles = await prisma.perfilEmisora.findMany({
      where: visibleParaUsuario(req.usuarioId),
      orderBy: { createdAt: 'asc' },
    });
    res.json({ perfiles });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const perfil = await prisma.perfilEmisora.findFirst({
      where: { id: req.params.id, ...visibleParaUsuario(req.usuarioId) },
    });
    if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' });
    res.json({ perfil });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = perfilCreateSchema.parse(req.body);
    const perfil = await prisma.perfilEmisora.create({
      data: { ...data, creadoPorId: req.usuarioId },
    });
    res.status(201).json({ perfil });
  } catch (err) {
    next(err);
  }
});

async function findPerfilPropio(id, usuarioId) {
  return prisma.perfilEmisora.findFirst({ where: { id, creadoPorId: usuarioId } });
}

router.patch('/:id', async (req, res, next) => {
  try {
    const existente = await findPerfilPropio(req.params.id, req.usuarioId);
    if (!existente) {
      return res.status(404).json({ error: 'Perfil no encontrado o no eres el propietario' });
    }
    const data = perfilUpdateSchema.parse(req.body);
    const perfil = await prisma.perfilEmisora.update({ where: { id: existente.id }, data });
    res.json({ perfil });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existente = await findPerfilPropio(req.params.id, req.usuarioId);
    if (!existente) {
      return res.status(404).json({ error: 'Perfil no encontrado o no eres el propietario' });
    }
    await prisma.perfilEmisora.delete({ where: { id: existente.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2003') {
      return res.status(409).json({ error: 'No se puede borrar: hay proyectos que usan este perfil' });
    }
    next(err);
  }
});

module.exports = router;
