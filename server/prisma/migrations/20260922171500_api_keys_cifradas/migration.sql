-- Las API keys de OpenAI y ElevenLabs pasan a guardarse cifradas (AES-256-GCM),
-- como pide la sección 5 del documento de diseño.
--
-- Se renombran las columnas para que quede claro, mirando solo la base de
-- datos, que su contenido ya no es texto plano. El renombrado conserva los
-- valores que hubiera, que siguen en claro hasta que se ejecute el script de
-- relleno: la clave de cifrado vive en la variable de entorno
-- CLAVE_CIFRADO_API_KEYS y no está disponible desde SQL, así que el cifrado de
-- las filas existentes no se puede hacer aquí.
--
-- Justo después de aplicar esta migración hay que ejecutar, con la misma
-- variable de entorno que usará el servidor:
--
--     npm run cifrar-api-keys
--
-- Es idempotente: salta las filas que ya estén cifradas.

ALTER TABLE "Usuario" RENAME COLUMN "apiKeyOpenAI" TO "apiKeyOpenAICifrada";
ALTER TABLE "Usuario" RENAME COLUMN "apiKeyEleven" TO "apiKeyElevenCifrada";
