# Radio estilo GTA

Coge una carpeta de canciones tuyas y monta un único archivo de audio en el que
un "DJ" habla antes de cada canción (te la presenta, mete algún comentario,
una falsa cuña publicitaria de vez en cuando...), igual que las emisoras de
radio de los juegos GTA. Todo generado con texto a voz, sin grabar nada tú.

## Instalación

Necesitas Python 3.9+ y **ffmpeg** instalado en tu sistema (en Windows, lo más
fácil es `winget install ffmpeg` o descargarlo de ffmpeg.org y añadirlo al PATH;
en Mac, `brew install ffmpeg`).

```
pip install -r requirements.txt
```

## Uso básico

```
python3 gta_radio.py --input ./canciones --output ./mi_radio.mp3
```

Esto busca todos los `.mp3/.wav/.m4a/.flac/.ogg` de la carpeta `canciones`,
lee su título/artista (de las etiquetas si las tiene, si no del nombre del
archivo) y genera `mi_radio.mp3` con las locuciones intercaladas.

### Para grabarlo directamente en CDs de audio

Como ya hablamos de que tu coche seguramente solo lee CD de audio normales
(limitados a ~74-80 min), puedes pedirle al script que reparta el resultado
en bloques que quepan en cada disco:

```
python3 gta_radio.py --input ./canciones --output ./radio.mp3 --max-minutes 78
```

Esto genera `radio_disco1.mp3`, `radio_disco2.mp3`, etc., cada uno de máximo
78 minutos, listos para grabar cada uno como un CD de audio con Windows Media
Player tal como vimos antes.

### Otras opciones útiles

- `--station "Nombre"` y `--dj "Apodo"`: personalizan cómo se llama a sí misma
  la emisora y el DJ en las locuciones.
- `--shuffle --seed 123`: orden aleatorio pero repetible (la misma semilla
  siempre da el mismo orden y guion).
- `--filler-every 4`: cada cuántas canciones se cuela un comentario extra
  (tráfico, cuña falsa, etc.). Pon `0` para desactivarlo.
- `--no-radio-fx`: por defecto la voz del DJ se filtra un poco para sonar
  "a radio"; con esto se deja limpia.
- `--no-dark-humor`: por defecto se mezclan algunos comentarios de humor
  negro (tono irónico/existencial, nada de temas delicados de verdad) entre
  las cuñas normales; con esto se desactivan y solo quedan las neutras.

## Las voces (texto a voz)

El script no llama a ninguna IA de pago por defecto. Tienes tres motores,
seleccionables con `--voice-engine`:

| Motor | Coste | Cuenta/API key | Calidad |
|---|---|---|---|
| `edge` (por defecto) | Gratis | No necesita nada | Buena, voces neuronales de Microsoft Edge |
| `openai` | Muy barato (~0,015 $ por 1000 caracteres) | `OPENAI_API_KEY` | Muy buena |
| `elevenlabs` | De pago (tiene plan gratuito limitado) | `ELEVENLABS_API_KEY` | La más realista/expresiva |

Por defecto usa `edge-tts`, una librería gratuita que usa las voces neuronales
de Microsoft (las mismas que "Leer en voz alta" de Edge/Windows) sin necesidad
de crear ninguna cuenta. Para probar otras voces disponibles en español:

```
edge-tts --list-voices | grep es-
```

y luego, por ejemplo: `--voice es-MX-JorgeNeural` o `--voice es-ES-ElviraNeural`.

Para usar OpenAI o ElevenLabs (mejor calidad, con coste), instala la librería
correspondiente (`pip install openai` o ya tienes `requests`), exporta la
variable de entorno con tu API key, y añade `--voice-engine openai` (o
`elevenlabs`) al comando.

## Personalizar lo que dice el DJ

Todo lo que dice el DJ sale de unas listas de plantillas al principio del
archivo `gta_radio.py` (`INTRO_TEMPLATES`, `PRESONG_TEMPLATES`,
`FILLER_TEMPLATES`, `OUTRO_TEMPLATES`). Son texto normal con un par de huecos
(`{title}`, `{by_artist}`, `{station}`, `{dj}`) que se rellenan solos. Añade,
quita o reescribe frases ahí para darle tu toque — cuantas más variantes
tengas, menos se repetirá el DJ en emisoras largas.

Si en algún momento quieres que las frases las escriba una IA en vez de
plantillas fijas (más variedad, nunca se repite igual), dímelo y adapto la
función `build_script` para que le pida el guion a un modelo de lenguaje en
vez de elegir de estas listas — pero tal y como está ya funciona sin depender
de ninguna cuenta ni coste.

## Notas

- Usa solo música tuya o con licencia para este tipo de uso.
- El primer intento, prueba con 3-4 canciones sueltas en una carpeta de test
  para ajustar el tono del DJ y el efecto de radio antes de procesar toda tu
  colección — la generación de voz tarda un poco por cada locución.