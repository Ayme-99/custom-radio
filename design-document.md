# Custom Radio — Documento de Diseño

## 1. Visión

Custom Radio es una **webapp Flutter** que genera "emisoras de radio" personalizadas a partir de canciones propias: el usuario

- Importa sus canciones.
- Elige o define una **finalidad/perfil de emisora** (ej. "Radio GTA", "Aniversario", "Roadtrip con amigos", perfil personalizado).
- La IA genera el guion del DJ adaptado a ese perfil y al contexto que aporte el usuario.
- Se sintetiza la voz (motor gratuito o de pago, con crédito/API key propia del usuario) y se monta el audio final.
- Descarga el resultado, opcionalmente partido en bloques para grabar en CD.

## 2. Alcance del MVP

- [ ] Registro/login de usuario.
- [ ] Vinculación de API key propia (OpenAI y/o ElevenLabs) por usuario.
- [ ] Crear proyecto → elegir perfil de emisora → importar canciones → rellenar contexto opcional.
- [ ] Generar guion con IA (system prompt derivado del perfil).
- [ ] Sintetizar voz y montar audio final en servidor.
- [ ] Descargar resultado (mp3 único o partido con `--max-minutes`).
- [ ] Borrado automático de audio tras expiración de TTL.

Fuera de MVP (a valorar más adelante): edición manual del guion frase a frase, reordenar pistas por drag&drop, compartir proyectos entre usuarios, perfiles públicos creados por la comunidad.

## 3. Perfiles de emisora

Cada perfil define cómo la IA debe escribir el guion. Estructura de un perfil:

| Campo | Descripción |
|---|---|
| `nombre` | Ej. "Radio GTA", "Aniversario" |
| `tono` | Instrucción de personalidad para el prompt (irónico/gamberro, cálido/romántico, neutro...) |
| `campos_contexto` | Qué le pide la app al usuario para ese perfil (nombre de la pareja, fecha, anécdotas, nivel de humor, etc.) |
| `humor_negro` | Si aplica el modo de comentarios existenciales/irónicos del script original |
| `plantillas_base` | Fallback sin IA: frases fijas con huecos (título, artista, nombre de la emisora, etc.) por si el usuario no quiere gastar crédito de API |

Perfiles iniciales: **Radio GTA** (el ya existente) y **Aniversario** (como ejemplo de perfil "personal").

## 4. Arquitectura

```
Flutter (web) → API Node (gestión usuarios, proyectos, orquestación) → HTTP interno → Servicio de generación de
                                                                                        audio (Python: FastAPI
                                                                                        envolviendo audio-engine/
                                                                                        custom_radio.py)
```

- **Frontend (Flutter web)**: import de canciones, formulario de perfil/contexto, selección de motor de voz, progreso de generación, descarga.
- **Backend (Node/Express, stack ya conocido)**: usuarios, proyectos, metadatos de pistas, guion generado, orquestación de la llamada al motor de audio.
- **Motor de generación**: servicio encargado de construir el guion, sintetizar la voz, montar el audio final y partirlo en bloques (para CD u otros formatos de salida). Decisión de stack: ver más abajo.
- **Generación de guion por IA**: se construye un prompt a partir del perfil de emisora + contexto del usuario y se llama al LLM elegido. Como fallback sin IA, cada perfil puede incluir plantillas fijas con huecos (título, artista, nombre de la emisora, etc.).

### 4.1 Decisión: stack del servicio de generación de audio

**Se mantiene Python**, como microservicio separado del backend Node, expuesto por HTTP (no invocado como subproceso).

- `audio-engine/custom_radio.py` ya está validado en producción manual: los tres motores TTS (edge/OpenAI/ElevenLabs v3), el pipeline pydub/ffmpeg, el recorte de silencios y la partición en bloques para CD funcionan. Reimplementar todo eso en Node obligaría a reescribir el pipeline de audio entero y el port de Node de `edge-tts` está bastante menos mantenido que la librería Python — más riesgo y más tiempo para el mismo resultado.
- Coste asumido: dos runtimes en el stack (Node + Python). En el despliegue (Render), el motor de audio pasa de ser un script CLI a una API mínima (ej. FastAPI) con un endpoint tipo `POST /generate` que recibe el guion + las pistas y devuelve el mp3 (o el estado de progreso), desplegada como su propio servicio. El backend Node la llama por HTTP en vez de lanzarla como subproceso, para evitar bloqueos de I/O y problemas de gestión de proceso hijo.
- Ver [#3](https://github.com/Ayme-99/custom-radio/issues/3).

## 5. Modelo de datos (persistente, sin audio)

**Usuario**
- id, email, credenciales
- api_keys (cifradas) por proveedor (OpenAI, ElevenLabs)

**Proyecto**
- id, usuario_id, nombre
- perfil_id usado
- contexto (json: respuestas del usuario a los `campos_contexto` del perfil)
- config_voz (motor, voz, rate, pitch, instrucciones)
- estado (borrador / guion_generado / audio_generado / expirado)
- ultima_actividad (para el TTL renovable)

**Pista** (metadatos únicamente)
- id, proyecto_id, título, artista, orden, duración

**Guion**
- id, proyecto_id
- lista de líneas de locución (texto) + a qué pista precede cada una

**Perfil de emisora**
- id, nombre, tono, campos_contexto, humor_negro, plantillas_base

## 6. Storage y ciclo de vida del audio (con copyright)

Regla general: **nada de audio con copyright se persiste indefinidamente**. Solo persisten metadatos y texto.

- Storage temporal (ej. S3 con *lifecycle policy* por prefijo, o disco del servidor con limpieza programada) para:
  - Canciones originales subidas por el usuario.
  - Locuciones de voz generadas.
  - Mp3/discos finales montados.
- **TTL renovable**: se borra tras X horas de inactividad del proyecto (no desde la subida). Cada interacción (reescuchar, regenerar, cambiar orden) renueva el contador.
- Aviso visible en la UI del tiempo restante antes del borrado, con acceso directo a descarga.
- Si el usuario vuelve a un proyecto cuyo audio ya expiró: los metadatos y el guion siguen ahí, solo tiene que volver a subir las canciones (no hace falta regenerar el guion con IA si no ha cambiado el contexto).
- Términos de uso: el usuario declara tener derecho a usar la música que sube; el proyecto no aloja música de forma persistente ni la redistribuye a terceros.

## 7. Coste de generación (API keys / crédito)

- El usuario vincula su propia API key (OpenAI y/o ElevenLabs) o inicia sesión con su cuenta del proveedor si el flujo lo permite.
- El coste de TTS corre a cargo del usuario, no de la plataforma.
- Motor `edge-tts` (gratuito, sin key) sigue disponible como opción por defecto/fallback.

## 8. Preguntas abiertas / decisiones pendientes

- [x] ~~Stack exacto del servicio de generación~~ — decidido: Python como microservicio HTTP separado (ver sección 4.1).
- [ ] ¿Cómo se gestiona el fallo a mitad de generación (ej. corte de red con la API de OpenAI/ElevenLabs a mitad de una tanda larga)? ¿Reintentos, guardado parcial de progreso?
- [ ] ¿Los perfiles de emisora los define solo la plataforma, o el usuario puede crear/guardar los suyos propios?
- [ ] Definir el TTL exacto en horas.
- [ ] ¿Notificación (email/push) antes de que expire el audio de un proyecto sin descargar?