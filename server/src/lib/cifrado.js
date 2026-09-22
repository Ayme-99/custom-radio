'use strict';

const crypto = require('node:crypto');

/**
 * Cifrado simétrico de las API keys que el usuario vincula a su cuenta.
 *
 * La sección 5 del documento de diseño exige que las api_keys de los
 * proveedores (OpenAI, ElevenLabs) se guarden cifradas, nunca en texto plano.
 *
 * Formato del valor que se almacena en base de datos:
 *
 *   v1.<iv en base64>.<tag en base64>.<texto cifrado en base64>
 *
 * El prefijo de versión permite cambiar de algoritmo más adelante sin tener
 * que adivinar cómo se cifró cada fila.
 */

const VERSION = 'v1';
const ALGORITMO = 'aes-256-gcm';
const LONGITUD_CLAVE = 32; // bytes (AES-256)
const LONGITUD_IV = 12; // bytes, tamaño recomendado para GCM
const LONGITUD_TAG = 16; // bytes

const NOMBRE_VARIABLE_CLAVE = 'CLAVE_CIFRADO_API_KEYS';

class ErrorCifrado extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorCifrado';
  }
}

/**
 * Acepta la clave en hexadecimal (64 caracteres) o en base64, y exige que
 * mida exactamente 32 bytes.
 */
function decodificarClave(valor) {
  let bytes;

  if (/^[0-9a-f]{64}$/i.test(valor)) {
    bytes = Buffer.from(valor, 'hex');
  } else {
    bytes = Buffer.from(valor, 'base64');
  }

  if (bytes.length !== LONGITUD_CLAVE) {
    throw new ErrorCifrado(
      `${NOMBRE_VARIABLE_CLAVE} debe ser una clave de ${LONGITUD_CLAVE} bytes ` +
        `en base64 o hexadecimal (se han leído ${bytes.length} bytes). ` +
        'Genera una con: npm run generar-clave'
    );
  }

  return bytes;
}

// La clave no cambia en caliente, pero se cachea por su valor crudo para que
// los tests puedan cambiar la variable de entorno sin reiniciar el proceso.
let cacheClave = { crudo: null, clave: null };

function obtenerClave() {
  const crudo = process.env[NOMBRE_VARIABLE_CLAVE];

  if (!crudo || crudo.trim() === '') {
    throw new ErrorCifrado(
      `Falta la variable de entorno ${NOMBRE_VARIABLE_CLAVE}, necesaria para ` +
        'cifrar y descifrar las API keys de los usuarios. ' +
        'Genera una con: npm run generar-clave'
    );
  }

  if (cacheClave.crudo === crudo) {
    return cacheClave.clave;
  }

  const clave = decodificarClave(crudo.trim());
  cacheClave = { crudo, clave };
  return clave;
}

/** True si hay clave configurada y es válida. No lanza. */
function hayClaveConfigurada() {
  try {
    obtenerClave();
    return true;
  } catch {
    return false;
  }
}

/** True si el valor tiene la forma de un secreto ya cifrado por este módulo. */
function estaCifrado(valor) {
  if (typeof valor !== 'string') return false;

  const partes = valor.split('.');
  if (partes.length !== 4 || partes[0] !== VERSION) return false;

  const iv = Buffer.from(partes[1], 'base64');
  const tag = Buffer.from(partes[2], 'base64');

  return iv.length === LONGITUD_IV && tag.length === LONGITUD_TAG && partes[3].length > 0;
}

/**
 * Cifra un secreto. `null` y `undefined` pasan tal cual: representan "el
 * usuario no ha vinculado esta API key".
 */
function cifrar(textoPlano) {
  if (textoPlano === null || textoPlano === undefined) return textoPlano;

  if (typeof textoPlano !== 'string') {
    throw new ErrorCifrado('Solo se pueden cifrar cadenas de texto.');
  }

  // Cifrar dos veces el mismo valor sería inofensivo, pero deja la base de
  // datos con envoltorios anidados imposibles de auditar a simple vista.
  if (estaCifrado(textoPlano)) return textoPlano;

  const iv = crypto.randomBytes(LONGITUD_IV);
  const cipher = crypto.createCipheriv(ALGORITMO, obtenerClave(), iv);
  const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64'), tag.toString('base64'), cifrado.toString('base64')].join('.');
}

/**
 * Descifra un secreto. Lanza si el valor no es un envoltorio válido: una API
 * key que llega en texto plano significa que falta pasar la migración de
 * cifrado por esa fila, y es preferible enterarse que seguir adelante.
 */
function descifrar(valor) {
  if (valor === null || valor === undefined) return valor;

  if (typeof valor !== 'string') {
    throw new ErrorCifrado('Solo se pueden descifrar cadenas de texto.');
  }

  if (!estaCifrado(valor)) {
    throw new ErrorCifrado(
      'El valor almacenado no está cifrado o tiene un formato desconocido. ' +
        'Si viene de antes del cifrado, ejecuta: npm run cifrar-api-keys'
    );
  }

  const [, ivB64, tagB64, cifradoB64] = valor.split('.');

  try {
    const decipher = crypto.createDecipheriv(ALGORITMO, obtenerClave(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(cifradoB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof ErrorCifrado) throw error;
    // GCM falla aquí tanto si la clave es otra como si alguien ha tocado el
    // dato; desde fuera no se puede distinguir, así que se dice lo mismo.
    throw new ErrorCifrado(
      'No se ha podido descifrar el valor: la clave no es la que lo cifró o el dato está corrupto.'
    );
  }
}

/** Genera una clave nueva lista para pegar en la variable de entorno. */
function generarClave() {
  return crypto.randomBytes(LONGITUD_CLAVE).toString('base64');
}

module.exports = {
  ErrorCifrado,
  NOMBRE_VARIABLE_CLAVE,
  cifrar,
  descifrar,
  estaCifrado,
  generarClave,
  hayClaveConfigurada,
  obtenerClave,
};
