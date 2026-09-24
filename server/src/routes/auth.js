const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const JWT_EXPIRES_IN = '7d';
const BCRYPT_ROUNDS = 12;

function signToken(usuario) {
  return jwt.sign({ sub: usuario.id, email: usuario.email }, requireJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Falta JWT_SECRET en las variables de entorno');
  }
  return secret;
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const usuario = await prisma.usuario.create({
      data: { email, passwordHash },
    });

    const token = signToken(usuario);
    res.status(201).json({ token, usuario: { id: usuario.id, email: usuario.email } });
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const usuario = await prisma.usuario.findUnique({ where: { email } });
    const credencialesInvalidas = () => res.status(401).json({ error: 'Email o contraseña incorrectos' });

    if (!usuario) return credencialesInvalidas();

    const passwordOk = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordOk) return credencialesInvalidas();

    const token = signToken(usuario);
    res.json({ token, usuario: { id: usuario.id, email: usuario.email } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuarioId },
      select: { id: true, email: true, createdAt: true },
    });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ usuario });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
