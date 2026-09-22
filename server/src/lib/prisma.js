'use strict';

const { PrismaClient } = require('@prisma/client');

const { cifrarEnArgs, descifrarEnResultado } = require('./cifradoUsuario');

/**
 * Cliente de Prisma con cifrado transparente de las API keys de usuario.
 *
 * El resto de la aplicación trabaja siempre con el secreto en claro: esta
 * extensión lo cifra justo antes de que salga hacia la base de datos y lo
 * descifra al volver, también cuando el `Usuario` llega dentro de una
 * relación incluida desde otro modelo.
 *
 * Lo que NO pasa por aquí es `$queryRaw` / `$executeRaw`: quien use SQL
 * directo verá el texto cifrado y tendrá que tratarlo con `src/lib/cifrado.js`.
 */
function crearCliente() {
  return new PrismaClient().$extends({
    name: 'cifrado-api-keys',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          return descifrarEnResultado(await query(cifrarEnArgs(args)));
        },
      },
    },
  });
}

const prisma = crearCliente();

module.exports = { prisma, crearCliente };
