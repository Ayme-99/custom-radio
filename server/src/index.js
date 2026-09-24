const express = require('express');
const cors = require('cors');
const { ZodError } = require('zod');
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en las variables de entorno (server/.env)');
}

const authRouter = require('./routes/auth');
const perfilesRouter = require('./routes/perfiles');
const proyectosRouter = require('./routes/proyectos');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/perfiles', perfilesRouter);
app.use('/proyectos', proyectosRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: err.issues });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server corriendo en puerto ${PORT}`);
});