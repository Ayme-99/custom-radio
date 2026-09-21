#!/usr/bin/env python3
"""
gta_radio.py — Genera una "emisora de radio" estilo GTA a partir de tus canciones:
mezcla tus pistas con locuciones de un DJ (texto a voz) entre canción y canción,
igual que las emisoras de radio de los juegos GTA.

Uso básico:
    python3 gta_radio.py --input ./canciones --output ./mi_radio.mp3

Para partirlo directamente en bloques que quepan en CDs de audio de 80 min:
    python3 gta_radio.py --input ./canciones --output ./radio.mp3 --max-minutes 78

Ver README.md para todas las opciones (voces, motores de texto a voz, personalización
del guion del DJ, etc.).
"""
import argparse
import asyncio
import os
import random
import re
import sys
from pathlib import Path

from pydub import AudioSegment
from pydub.silence import detect_leading_silence

try:
    from dotenv import load_dotenv
    load_dotenv(override=True)  # carga audio-engine/.env si existe (API keys locales); prioridad sobre el entorno
except ImportError:  # python-dotenv es opcional: sin él, solo variables de entorno del sistema
    pass

try:
    from mutagen import File as MutagenFile
except ImportError:  # mutagen es opcional: sin él, usamos el nombre del archivo
    MutagenFile = None

SUPPORTED_EXT = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}

# ---------------------------------------------------------------------------
# 1. Metadatos de las canciones
# ---------------------------------------------------------------------------


def read_track_info(path: Path):
    """Intenta leer título/artista de las etiquetas del archivo; si no hay, usa el nombre."""
    title, artist = None, None
    if MutagenFile is not None:
        try:
            audio = MutagenFile(path, easy=True)
            if audio:
                title = (audio.get("title") or [None])[0]
                artist = (audio.get("artist") or [None])[0]
        except Exception:
            pass
    if not title:
        title = re.sub(r"^\d+[\s\-\._]*", "", path.stem).replace("_", " ").strip()
    return title or path.stem, artist


def collect_tracks(input_dir: Path, shuffle=False, seed=None):
    files = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in SUPPORTED_EXT)
    if shuffle:
        random.Random(seed).shuffle(files)
    tracks = []
    for f in files:
        title, artist = read_track_info(f)
        tracks.append((f, title, artist))
    return tracks


# ---------------------------------------------------------------------------
# 2. Guion del DJ — plantillas, sin necesidad de ninguna IA externa en tiempo real
#    (edítalas a tu gusto, es la parte más "tuya" del proyecto)
# ---------------------------------------------------------------------------

INTRO_TEMPLATES = [
    "Estás sintonizando {station}, la única emisora que suena mejor que la radio de verdad. Vamos con lo bueno.",
    "Buenas, soy {dj}, y esto es {station}. Prepárate, que empezamos fuerte.",
    "{station}, directa a tus altavoces. Aquí {dj}, acompañándote el viaje.",
    "¡Y arrancamos! Esto es {station}. ¡Vamos allá!",
]

PRESONG_TEMPLATES = [
    "Ahora toca {title}{by_artist}. Sube el volumen.",
    "Esto que viene es {title}{by_artist}. Una de mis favoritas, la verdad.",
    "Y seguimos con {title}{by_artist}. No toques el dial.",
    "{title}{by_artist}. Disfrútala.",
    "Directos a por {title}{by_artist}, sin parar.",
    "Va por ti, quien sea que estés escuchando esto: {title}{by_artist}.",
    "¡Vamos con {title}{by_artist}!",
    "Y esto no para. {title}{by_artist}. ¡Aquí llega!",
]

FILLER_TEMPLATES = [
    "Recuerda: conducir cansado también es conducir distraído. Para y descansa si lo necesitas.",
    "El tráfico hoy pinta tranquilo, así que aprovecha y disfruta del viaje.",
    "Un aviso rápido: en {station} nunca hay anuncios de verdad, solo yo hablando de más.",
    "Si vas con prisa, baja el pie del acelerador, que las curvas no perdonan.",
    "Esto va dedicado a quien esté escuchando esto en su coche ahora mismo. Sí, tú.",
    "{station}, sonando fuerte, como siempre.",
]

OUTRO_TEMPLATES = [
    "Eso ha sido todo por ahora en {station}. Gracias por acompañarnos.",
    "Se acaba el viaje musical de hoy en {station}. Hasta la próxima.",
]

# Humor negro genérico: tono irónico/existencial, sin meterse con nadie en
# concreto ni con temas delicados de verdad (nada de autolesión, violencia,
# accidentes de tráfico ni cosas por el estilo — esto suena dentro de un
# coche, delante de quien sea que vaya contigo, así que lo dejamos en clave
# absurda/filosófica, no macabra ni explícita de verdad).
DARK_HUMOR_TEMPLATES = [
    "Dicen que la vida es corta. Pues las canciones de aquí, más todavía.",
    "Recuerda que, tarde o temprano, todos vamos a desaparecer. Mientras tanto, sube el volumen.",
    "La buena noticia es que esta canción se acaba pronto. La mala, que todo lo demás también.",
    "Un optimista es alguien que aún no se ha enterado bien de cómo va esto. Aquí, en {station}, ya lo sabemos y seguimos sonando igual.",
    "Nada dura para siempre. Ni esta canción, ni el DJ, ni tú. Así que disfruta el rato.",
    "Si el universo se apaga ahora mismo, que sepas que la banda sonora de tus últimos segundos ha sido {station}. De nada.",
    "Cada canción que suena es un minuto menos de tu vida. Pero bueno, al menos suena bien.",
    "No sé qué es peor, si el silencio o yo hablando. Sigamos con música, por si acaso.",
]


def _by_artist(artist):
    return f", de {artist}" if artist else ""


class TemplatePicker:
    """Elige frases al azar de una lista sin repetir ninguna hasta haber usado
    todas las demás (como una baraja que se reparte entera antes de volver a
    barajarse). Al rebarajar, evita que la última frase dicha sea la primera
    de la nueva vuelta, para que tampoco se repita "por los pelos" justo al
    empezar de nuevo."""

    def __init__(self, pool, rnd):
        self._pool = list(pool)
        self._rnd = rnd
        self._deck = []
        self._last = None

    def _refill(self):
        deck = list(self._pool)
        self._rnd.shuffle(deck)
        if self._last is not None and len(deck) > 1 and deck[-1] == self._last:
            deck[-1], deck[-2] = deck[-2], deck[-1]
        self._deck = deck

    def pick(self):
        if not self._deck:
            self._refill()
        item = self._deck.pop()
        self._last = item
        return item


def build_script(tracks, station="Ayme Esteishon", dj="tu DJ de confianza",
                  filler_every=4, seed=None, dark_humor=True):
    """Devuelve una lista de tuplas (tipo, contenido) intercalando voz y canciones.
    tipo == "voice" -> contenido es el texto a convertir a audio.
    tipo == "song"  -> contenido es la ruta al archivo de audio.
    """
    rnd = random.Random(seed)
    filler_pool = list(FILLER_TEMPLATES)
    if dark_humor:
        filler_pool += DARK_HUMOR_TEMPLATES

    presong_picker = TemplatePicker(PRESONG_TEMPLATES, rnd)
    filler_picker = TemplatePicker(filler_pool, rnd)

    script = [("voice", rnd.choice(INTRO_TEMPLATES).format(station=station, dj=dj))]
    for i, (path, title, artist) in enumerate(tracks):
        presong_line = presong_picker.pick().format(
            title=title, by_artist=_by_artist(artist))
        if filler_every and i > 0 and i % filler_every == 0:
            # El filler y el presong van pegados en UNA sola locución (una
            # sola llamada de voz), para que suene de corrido en vez de como
            # dos audios distintos enganchados.
            filler_line = filler_picker.pick().format(station=station)
            voice_line = f"{filler_line} {presong_line}"
        else:
            voice_line = presong_line
        script.append(("voice", voice_line))
        script.append(("song", str(path)))
    script.append(("voice", rnd.choice(OUTRO_TEMPLATES).format(station=station)))
    return script


# ---------------------------------------------------------------------------
# 3. Texto a voz — un único punto de entrada (`synthesize`) para poder cambiar
#    de motor sin tocar el resto del script.
# ---------------------------------------------------------------------------


async def _edge_tts_synth(text, out_path, voice, rate="+0%", pitch="+0Hz"):
    import edge_tts
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(str(out_path))


def synthesize(text, out_path, engine="edge", voice=None, rate="+0%", pitch="+0Hz",
                instructions=None):
    out_path = Path(out_path)
    if engine == "edge":
        # Gratis, sin API key. Requiere conexión a internet normal (nada de
        # cuentas ni tarjetas). Lista de voces: `edge-tts --list-voices`.
        # --rate y --pitch te dejan darle más energía a la voz (p.ej. --rate +8%).
        asyncio.run(_edge_tts_synth(text, out_path, voice or "es-ES-AlvaroNeural",
                                     rate=rate, pitch=pitch))
    elif engine == "openai":
        # De pago (unos céntimos por locución). Necesita OPENAI_API_KEY.
        # gpt-4o-mini-tts admite "instructions" para pedirle un estilo de voz
        # concreto (tono, energía, acento...), justo lo que hace falta para
        # sonar a locutor profesional en vez de a lectura plana.
        from openai import OpenAI
        client = OpenAI()
        with client.audio.speech.with_streaming_response.create(
            model="gpt-4o-mini-tts",
            voice=voice or "onyx",
            input=text,
            instructions=instructions or (
                "Habla como un locutor de radio profesional en español: voz cálida, "
                "segura de sí misma, con energía, buen ritmo y carisma. Nada de tono "
                "robótico ni monótono."
            ),
        ) as resp:
            resp.stream_to_file(str(out_path))
    elif engine == "elevenlabs":
        # De pago, la voz más realista. Necesita ELEVENLABS_API_KEY.
        # eleven_v3 (por defecto) admite audio tags entre corchetes en el propio
        # texto para dirigir la interpretación, p.ej. [excited], [whispers],
        # [laughs] — ver los "audio tags" en la guía de prompting de v3.
        import requests
        api_key = os.environ["ELEVENLABS_API_KEY"]
        voice_id = voice or os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
        model_id = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_v3")
        r = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": api_key},
            json={"text": text, "model_id": model_id},
            timeout=60,
        )
        r.raise_for_status()
        out_path.write_bytes(r.content)
    else:
        raise ValueError(f"Motor de voz desconocido: {engine}")


# ---------------------------------------------------------------------------
# 4. Montaje del audio final
# ---------------------------------------------------------------------------


def radio_effect(segment: AudioSegment) -> AudioSegment:
    """Toque sutil de 'transmisión de radio' a las locuciones del DJ. Es un
    efecto opcional (--radio-fx): con una voz sintética, un filtro agresivo
    tiende a sonar más barato, no más profesional, así que por defecto está
    desactivado — la voz suena mejor limpia."""
    seg = segment.high_pass_filter(120).low_pass_filter(9000)
    return seg.apply_gain(2)


def assemble(script, workdir: Path, voice_engine, voice_name, gap_ms=400,
             radio_fx=False, synth_fn=synthesize, rate="+0%", pitch="+0Hz",
             instructions=None):
    workdir.mkdir(parents=True, exist_ok=True)
    final = AudioSegment.silent(duration=0)
    gap = AudioSegment.silent(duration=gap_ms)

    for idx, (kind, payload) in enumerate(script):
        if kind == "voice":
            tmp = workdir / f"voice_{idx:03d}.mp3"
            print(f"  \U0001F399️  Locución {idx + 1}/{len(script)}: {payload[:60]}...")
            synth_fn(payload, tmp, engine=voice_engine, voice=voice_name,
                     rate=rate, pitch=pitch, instructions=instructions)
            seg = AudioSegment.from_file(tmp)
            if radio_fx:
                seg = radio_effect(seg)
        else:
            print(f"  \U0001F3B5 Canción: {Path(payload).name}")
            seg = AudioSegment.from_file(payload)
        final += seg + gap
    return final


def safe_export(segment: AudioSegment, path: Path, **kwargs):
    """Exporta el audio; si el archivo está bloqueado (abierto en un
    reproductor, en el Explorador de Windows, etc.) no perdemos el trabajo ya
    hecho — se guarda con un nombre alternativo en su lugar."""
    try:
        segment.export(path, **kwargs)
        return path
    except PermissionError:
        alt = path.parent / f"{path.stem}_nuevo{path.suffix}"
        print(f"  ⚠️  No puedo escribir en {path} (¿está abierto en algún "
              f"reproductor de música o en el Explorador de Windows? ciérralo e "
              f"inténtalo de nuevo). Guardando como {alt} en su lugar.")
        segment.export(alt, **kwargs)
        return alt


def split_for_cd(track: AudioSegment, max_minutes: float):
    """Divide el audio final en bloques de como mucho `max_minutes` cada uno
    (útil para que cada bloque quepa en un CD de audio de 74-80 min)."""
    max_ms = int(max_minutes * 60 * 1000)
    if len(track) <= max_ms:
        return [track]
    return [track[start:start + max_ms] for start in range(0, len(track), max_ms)]


# ---------------------------------------------------------------------------
# 5. CLI
# ---------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", required=True, help="Carpeta con tus canciones")
    ap.add_argument("--output", default="mi_radio.mp3", help="Archivo de salida")
    ap.add_argument("--station", default="Ayme Esteishon", help="Nombre de la emisora")
    ap.add_argument("--dj", default="tu DJ de confianza", help="Nombre/apodo del DJ")
    ap.add_argument("--filler-every", type=int, default=4,
                     help="Cada cuántas canciones meter un comentario extra (0 para desactivar)")
    ap.add_argument("--no-dark-humor", action="store_true",
                     help="No incluir las frases de humor negro en los comentarios extra")
    ap.add_argument("--shuffle", action="store_true", help="Orden aleatorio de canciones")
    ap.add_argument("--seed", type=int, default=None,
                     help="Semilla fija, para poder repetir exactamente el mismo resultado")
    ap.add_argument("--voice-engine", choices=["edge", "openai", "elevenlabs"], default="edge",
                     help="Motor de texto a voz (edge = gratis, sin cuenta ni API key)")
    ap.add_argument("--voice", default=None,
                     help="Nombre/ID de voz específico del motor elegido")
    ap.add_argument("--rate", default="+0%",
                     help="[Solo edge] Velocidad de la voz, p.ej. +10%% o -5%%")
    ap.add_argument("--pitch", default="+0Hz",
                     help="[Solo edge] Tono de la voz, p.ej. +20Hz o -20Hz")
    ap.add_argument("--voice-instructions", default=None,
                     help="[Solo openai/gpt-4o-mini-tts] Instrucción de estilo para la voz "
                          "(por defecto ya pide tono de locutor de radio profesional)")
    ap.add_argument("--radio-fx", action="store_true",
                     help="Aplicar un filtro sutil de 'transmisión de radio' a las locuciones "
                          "(desactivado por defecto: con voces sintéticas suele sonar peor)")
    ap.add_argument("--max-minutes", type=float, default=None,
                     help="Si se indica, divide la emisora final en bloques de máx. N minutos "
                          "(usa 78 para que cada bloque quepa en un CD de audio de 80 min)")
    args = ap.parse_args()

    input_dir = Path(args.input)
    if not input_dir.is_dir():
        sys.exit(f"No encuentro la carpeta: {input_dir}")

    tracks = collect_tracks(input_dir, shuffle=args.shuffle, seed=args.seed)
    if not tracks:
        sys.exit("No he encontrado canciones (.mp3/.wav/.m4a/.flac/.ogg) en esa carpeta.")
    print(f"\U0001F4FB {len(tracks)} canciones encontradas. Generando guion del DJ...")

    script = build_script(tracks, station=args.station, dj=args.dj,
                           filler_every=args.filler_every, seed=args.seed,
                           dark_humor=not args.no_dark_humor)

    out_path = Path(args.output)
    workdir = out_path.parent / f"{out_path.stem}_tmp"
    final = assemble(script, workdir, args.voice_engine, args.voice,
                      radio_fx=args.radio_fx, rate=args.rate, pitch=args.pitch,
                      instructions=args.voice_instructions)

    duration_min = len(final) / 60000
    print(f"✅ Emisora montada: {duration_min:.1f} minutos en total.")

    if args.max_minutes:
        parts = split_for_cd(final, args.max_minutes)
        for i, part in enumerate(parts, 1):
            part_path = out_path.parent / f"{out_path.stem}_disco{i}{out_path.suffix}"
            written = safe_export(part, part_path, format="mp3", bitrate="192k")
            print(f"  \U0001F4BF Disco {i}: {written} ({len(part) / 60000:.1f} min)")
        print(f"Necesitarás {len(parts)} CD(s) de audio de {args.max_minutes} min para grabarlo todo.")
    else:
        written = safe_export(final, out_path, format="mp3", bitrate="192k")
        print(f"Guardado en: {written}")


if __name__ == "__main__":
    main()