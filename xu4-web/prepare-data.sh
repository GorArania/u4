#!/usr/bin/env bash
#
# Stellt das Datenverzeichnis für den xu4-WASM-Build zusammen.
# Quelle: ../game (originale U4-DOS-Dateien) und ../xu4 (Engine-Daten).
# Ziel:   dist/data/  (wird per --preload-file ins virtuelle FS gepackt)
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GAME="$ROOT/game"
XU4="$ROOT/xu4"
DATA="$(cd "$(dirname "$0")" && pwd)/dist/data"

rm -rf "$DATA"
mkdir -p "$DATA/ultima4" "$DATA/conf" "$DATA/graphics" "$DATA/mid" "$DATA/sound"

# Originale DOS-Spieldateien (ohne Upgrade-Ordner / Hilfsdateien)
for f in "$GAME"/*; do
  name="$(basename "$f")"
  [ -d "$f" ] && continue
  case "${name,,}" in
    *.bat|readme.md|autoexec.txt|run.bat) continue ;;
  esac
  cp "$f" "$DATA/ultima4/"
done

# VGA-Upgrade als u4upgrad.zip neu packen (xu4 liest die VGA-Grafik daraus)
if [ -d "$GAME/upgrade" ]; then
  ( cd "$GAME/upgrade" && zip -qr "$DATA/u4upgrad.zip" . )
fi

# Engine-Daten von xu4
cp "$XU4"/conf/*.xml "$DATA/conf/" 2>/dev/null || true
mkdir -p "$DATA/conf/dtd" && cp "$XU4"/conf/dtd/* "$DATA/conf/dtd/" 2>/dev/null || true
cp -r "$XU4"/graphics/* "$DATA/graphics/" 2>/dev/null || true
cp "$XU4"/mid/*.mid "$DATA/mid/" 2>/dev/null; cp "$XU4"/mid/*.ogg "$DATA/mid/" 2>/dev/null || true
cp "$XU4"/sound/* "$DATA/sound/" 2>/dev/null || true

echo "Daten zusammengestellt unter $DATA"
du -sh "$DATA"
