const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta el token de autenticación' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuarioId = payload.sub;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido o caducado' });
  }
}

module.exports = requireAuth;
