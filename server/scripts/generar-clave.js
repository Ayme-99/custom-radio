'use strict';

const { NOMBRE_VARIABLE_CLAVE, generarClave } = require('../src/lib/cifrado');

console.log(`${NOMBRE_VARIABLE_CLAVE}=${generarClave()}`);
