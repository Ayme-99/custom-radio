'use strict';

const { ErrorCifrado, cifrar, descifrar, estaCifrado } = require('./cifrado');

/**
 * Traducción entre el texto plano que usa el código de la aplicación y el
 * texto cifrado que se guarda en base de datos.
 *
 * Los nombres son los del modelo de Prisma; las columnas reales se llaman
 * `apiKeyOpenAICifrada` y `apiKeyElevenCifrada` (ver `schema.prisma`), para
 * que quede claro en la propia base de datos que ahí no hay texto plano.
 */
const CAMPOS_CIFRADOS = ['apiKeyOpenAI', 'apiKeyEleven'];

// Ramas de los argumentos de Prisma que describen filtros, no datos a escribir.
const CLAVES_DE_FILTRO = new Set(['where', 'cursor', 'orderBy', 'distinct', 'having']);

// Ramas que solo eligen qué columnas devolver: sus valores son `true`/`false`
// o sub-consultas, nunca secretos que cifrar.
const CLAVES_DE_PROYECCION = new Set(['select', 'include', 'omit']);

function esObjetoPlano(valor) {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor) &&
    !(valor instanceof Date) &&
    !Buffer.isBuffer(valor)
  );
}

/**
 * Cifra un valor tal y como puede aparecer dentro de `data`: o el secreto
 * directamente, o envuelto en `{ set: ... }`.
 */
function cifrarValorDeCampo(valor) {
  if (esObjetoPlano(valor) && 'set' in valor) {
    return { ...valor, set: cifrar(valor.set) };
  }
  return cifrar(valor);
}

/**
 * Recorre los argumentos de una consulta de Prisma cifrando las API keys que
 * se vayan a escribir, incluidas las de escrituras anidadas
 * (`proyecto.create({ data: { usuario: { create: ... } } })`).
 *
 * Filtrar por una API key no funciona: cada cifrado lleva un IV distinto, así
 * que el mismo secreto produce un valor diferente cada vez y ningún `where`
 * llegaría a casar. Se avisa en vez de devolver silenciosamente cero filas.
 */
function cifrarEnArgs(args) {
  return recorrerArgs(args);
}

function recorrerArgs(nodo) {
  if (Array.isArray(nodo)) {
    return nodo.map(recorrerArgs);
  }

  if (!esObjetoPlano(nodo)) {
    return nodo;
  }

  const salida = {};

  for (const [clave, valor] of Object.entries(nodo)) {
    if (CLAVES_DE_FILTRO.has(clave)) {
      comprobarFiltro(valor, clave);
      salida[clave] = valor;
      continue;
    }

    if (CLAVES_DE_PROYECCION.has(clave)) {
      salida[clave] = valor;
      continue;
    }

    if (CAMPOS_CIFRADOS.includes(clave)) {
      salida[clave] = cifrarValorDeCampo(valor);
      continue;
    }

    salida[clave] = recorrerArgs(valor);
  }

  return salida;
}

function comprobarFiltro(nodo, clave) {
  if (Array.isArray(nodo)) {
    nodo.forEach((hijo) => comprobarFiltro(hijo, clave));
    return;
  }

  if (!esObjetoPlano(nodo)) return;

  for (const [nombre, valor] of Object.entries(nodo)) {
    if (CAMPOS_CIFRADOS.includes(nombre)) {
      throw new ErrorCifrado(
        `No se puede usar "${nombre}" dentro de "${clave}": está cifrado con un IV ` +
          'aleatorio, así que el valor guardado es distinto cada vez y la comparación nunca casaría.'
      );
    }
    comprobarFiltro(valor, clave);
  }
}

/**
 * Recorre el resultado de una consulta descifrando las API keys, estén en el
 * registro de primer nivel o en una relación incluida.
 */
function descifrarEnResultado(nodo) {
  if (Array.isArray(nodo)) {
    return nodo.map(descifrarEnResultado);
  }

  if (!esObjetoPlano(nodo)) {
    return nodo;
  }

  const salida = {};

  for (const [clave, valor] of Object.entries(nodo)) {
    if (CAMPOS_CIFRADOS.includes(clave) && (typeof valor === 'string' || valor === null)) {
      salida[clave] = descifrar(valor);
      continue;
    }

    salida[clave] = descifrarEnResultado(valor);
  }

  return salida;
}

module.exports = {
  CAMPOS_CIFRADOS,
  cifrarEnArgs,
  descifrarEnResultado,
  estaCifrado,
};
