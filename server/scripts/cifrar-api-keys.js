'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const { NOMBRE_VARIABLE_CLAVE, cifrar, descifrar, estaCifrado, obtenerClave } = require('../src/lib/cifrado');
const { CAMPOS_CIFRADOS } = require('../src/lib/cifradoUsuario');

/**
 * Cifra las API keys que quedaron en texto plano de antes de la migración
 * `20260922171500_api_keys_cifradas`.
 *
 *   npm run cifrar-api-keys -- --dry-run   (solo informa, no escribe)
 *   npm run cifrar-api-keys                (cifra)
 *
 * Es idempotente: las filas ya cifradas se saltan, así que se puede repetir
 * sin miedo si se queda a medias.
 *
 * Usa el cliente de Prisma sin la extensión de cifrado a propósito: aquí hace
 * falta ver y escribir el valor tal cual está en la columna.
 */
async function main() {
  const soloSimular = process.argv.includes('--dry-run');

  // Falla antes de tocar nada si la clave no está o no es válida.
  obtenerClave();

  const prisma = new PrismaClient();

  const resumen = { vacias: 0, yaCifradas: 0, cifradas: 0 };
  const usuariosTocados = [];

  try {
    const usuarios = await prisma.usuario.findMany({
      select: { id: true, email: true, apiKeyOpenAI: true, apiKeyEleven: true },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Usuarios en base de datos: ${usuarios.length}`);

    for (const usuario of usuarios) {
      const datos = {};

      for (const campo of CAMPOS_CIFRADOS) {
        const valor = usuario[campo];

        if (valor === null || valor === undefined || valor === '') {
          resumen.vacias += 1;
          continue;
        }

        if (estaCifrado(valor)) {
          resumen.yaCifradas += 1;
          continue;
        }

        datos[campo] = cifrar(valor);
        resumen.cifradas += 1;
      }

      if (Object.keys(datos).length === 0) continue;

      usuariosTocados.push(`${usuario.email} (${Object.keys(datos).join(', ')})`);

      if (soloSimular) continue;

      // Comprobación de ida y vuelta antes de escribir: más vale descubrir
      // aquí que la clave no vale que dejar un secreto irrecuperable.
      for (const [campo, valorCifrado] of Object.entries(datos)) {
        if (descifrar(valorCifrado) !== usuario[campo]) {
          throw new Error(`El cifrado de "${campo}" del usuario ${usuario.id} no se pudo verificar. Se aborta sin escribir.`);
        }
      }

      await prisma.usuario.update({ where: { id: usuario.id }, data: datos });
    }

    for (const linea of usuariosTocados) {
      console.log(soloSimular ? `  pendiente: ${linea}` : `  cifrada:   ${linea}`);
    }

    console.log(
      `\nAPI keys vacías: ${resumen.vacias} · ya cifradas: ${resumen.yaCifradas} · ` +
        `${soloSimular ? 'pendientes de cifrar' : 'cifradas ahora'}: ${resumen.cifradas}`
    );

    if (soloSimular && resumen.cifradas > 0) {
      console.log('\nSimulación: no se ha escrito nada. Repite sin --dry-run para aplicarlo.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\nNo se ha podido completar el cifrado (${NOMBRE_VARIABLE_CLAVE} debe ser la misma clave que use el servidor):`);
  console.error(error.message);
  process.exitCode = 1;
});
