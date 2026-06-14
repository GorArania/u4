#!/usr/bin/env bash
#
# Rendert die MIDI-Musik von xu4 (../xu4/mid/*.mid) nach OGG, damit sie im
# Browser abgespielt werden kann (Browser dekodieren OGG, aber kein MIDI).
# Die erzeugten *.ogg liegen neben den *.mid und werden eingecheckt, da der
# Build-Rechner sonst fluidsynth + Soundfont bräuchte.
#
# Voraussetzungen: fluidsynth, ffmpeg, ein General-MIDI-Soundfont.
set -euo pipefail
MID="$(cd "$(dirname "$0")/../xu4/mid" && pwd)"
SF="${SOUNDFONT:-/usr/share/sounds/sf2/FluidR3_GM.sf2}"

for m in "$MID"/*.mid; do
  base="$(basename "${m%.mid}")"
  fluidsynth -ni -F "/tmp/$base.wav" -r 44100 "$SF" "$m" >/dev/null 2>&1
  ffmpeg -y -i "/tmp/$base.wav" -c:a libvorbis -q:a 3 "$MID/$base.ogg" >/dev/null 2>&1
  echo "$base.ogg"
done
