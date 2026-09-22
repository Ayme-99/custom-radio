# Servidor (API Node/Express)

Backend de Custom Radio: usuarios, proyectos, metadatos de pistas y guion.
Ver `../design-document.md` para el diseño completo.

## Puesta en marcha

```bash
npm install
cp .env.example .env    # y rellena los valores
npm run generar-clave   # imprime una CLAVE_CIFRADO_API_KEYS lista para pegar
npx prisma migrate deploy
npm run dev
```

```bash
npm test                # tests unitarios (node --test)
```

## Cifrado de las API keys de usuario

Cada usuario vincula sus propias API keys de OpenAI y ElevenLabs, y la sección
5 del documento de diseño exige guardarlas cifradas. El cifrado es AES-256-GCM
con la clave de `CLAVE_CIFRADO_API_KEYS` (32 bytes en base64 o hexadecimal).

El código de la aplicación trabaja siempre con el secreto en claro: quien cifra
y descifra es el cliente de Prisma de `src/lib/prisma.js`, que envuelve al
normal. Basta con usar ese cliente:

```js
const { prisma } = require('./lib/prisma');

await prisma.usuario.update({ where: { id }, data: { apiKeyOpenAI: 'sk-proj-...' } });
const usuario = await prisma.usuario.findUnique({ where: { id } }); // ya descifrada
```

Dos cosas que conviene saber:

- **No se puede filtrar por una API key.** Cada cifrado lleva un IV aleatorio,
  así que el mismo secreto se guarda distinto cada vez y ningún `where` casaría.
  Intentarlo lanza un `ErrorCifrado` en vez de devolver cero filas en silencio.
- **`$queryRaw` y `$executeRaw` no pasan por la extensión.** Quien use SQL
  directo verá el texto cifrado y tendrá que tratarlo con `src/lib/cifrado.js`.

Si se pierde o se cambia la clave, las API keys guardadas quedan
irrecuperables y los usuarios tendrán que volver a vincularlas.

## Despliegue con filas ya existentes

La migración `20260922171500_api_keys_cifradas` renombra las columnas a
`apiKeyOpenAICifrada` / `apiKeyElevenCifrada`, pero no puede cifrar lo que ya
hubiera guardado: la clave está en una variable de entorno y no es accesible
desde SQL. El orden al desplegar es:

1. Configurar `CLAVE_CIFRADO_API_KEYS` en el entorno (Render).
2. `npx prisma migrate deploy`
3. `npm run cifrar-api-keys -- --dry-run` para ver qué filas quedan en claro.
4. `npm run cifrar-api-keys` para cifrarlas.

El paso 4 es idempotente (salta lo ya cifrado) y comprueba que cada valor se
puede volver a descifrar antes de escribirlo. Hasta que se ejecute, leer un
usuario con una API key todavía en texto plano lanza un `ErrorCifrado`: es
preferible enterarse a seguir adelante como si nada.
