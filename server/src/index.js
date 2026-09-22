const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { NOMBRE_VARIABLE_CLAVE, hayClaveConfigurada } = require('./lib/cifrado');

// Sin esta clave el servidor arranca igual (y /health responde), pero no puede
// guardar ni leer las API keys de los usuarios: mejor decirlo al arrancar que
// descubrirlo en la primera petición que las toque.
if (!hayClaveConfigurada()) {
  console.warn(
    `AVISO: ${NOMBRE_VARIABLE_CLAVE} no está configurada o no es válida. ` +
      'Las API keys de usuario no se podrán cifrar ni descifrar. ' +
      'Genera una clave con: npm run generar-clave'
  );
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server corriendo en puerto ${PORT}`);
});