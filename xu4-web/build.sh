#!/usr/bin/env bash
#
# Baut die xu4-Engine (../xu4) nach WebAssembly.
# Voraussetzungen:
#   - Emscripten SDK aktiviert (source /opt/emsdk/emsdk_env.sh)
#   - libxml2 als WASM-Statiklib unter $LIBXML2_WASM (siehe README)
#   - Datenverzeichnis erstellt (./prepare-data.sh)
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../xu4/src" && pwd)"
OUTDIR="$HERE/web"
LIBXML2_WASM="${LIBXML2_WASM:-/opt/libxml2-wasm}"
BUILD="${BUILD:-/tmp/xu4build}"
DATA="$HERE/dist/data"

mkdir -p "$BUILD/lzw"

CXXFLAGS="-I. -I$LIBXML2_WASM/include/libxml2 -sUSE_SDL=1 -sUSE_SDL_MIXER=1 \
  -sUSE_LIBPNG=1 -sUSE_ZLIB=1 -DVERSION=\"1.0beta3-web\" -DICON_FILE=\"u4.bmp\" \
  -DHAVE_VARIADIC_MACROS=1 -std=gnu++14 -O2 -Wno-everything"
CFLAGS="-I. -sUSE_ZLIB=1 -O2 -Wno-everything"

# Linker-Flags. ASYNCIFY lässt xu4s blockierende Hauptschleife (SDL_WaitEvent)
# laufen; web_sdl_timer.js repariert SDL_AddTimer (periodisch statt einmalig).
LDFLAGS="-sUSE_SDL=1 -sUSE_SDL_MIXER=1 -sUSE_LIBPNG=1 -sUSE_ZLIB=1 \
  -sASYNCIFY -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=0 -sFORCE_FILESYSTEM=1 \
  -sSTACK_SIZE=8MB -lidbfs.js -sEXPORTED_RUNTIME_METHODS=FS,callMain,ccall \
  --use-preload-plugins --js-library $HERE/web_sdl_timer.js -O2"

CXX_SRCS="annotation armor aura camp cheat city codex combat config controller
  conversation creature death debug dialogueloader dialogueloader_tlk direction
  dngview dungeon dungeonview error event event_sdl filesystem game io image_sdl
  imageloader imageloader_png imageloader_u4 imageloader_u5 imagemgr imageview
  intro item location map maploader mapmgr menu menuitem moongate movement music
  names object person player portal progress_bar rle savegame scale script screen
  screen_sdl settings shrine sound spell stats textview tile tileanim tilemap
  tileset tileview u4 u4_sdl u4file utils view weapon xml web_compat
  lzw/u4decode lzw/u6decode"
C_SRCS="lzw/hash lzw/lzw unzip"

cd "$SRC"
for f in $CXX_SRCS; do
  echo "CXX $f"; emcc $CXXFLAGS -c "$f.cpp" -o "$BUILD/$f.o"
done
for f in $C_SRCS; do
  echo "CC  $f"; emcc $CFLAGS -c "$f.c" -o "$BUILD/$f.o"
done

echo "LINK u4.js"
emcc "$BUILD"/*.o "$BUILD"/lzw/*.o "$LIBXML2_WASM/lib/libxml2.a" \
  $LDFLAGS --preload-file "$DATA@/" -o "$OUTDIR/u4.js"

echo "Fertig: $OUTDIR/u4.{js,wasm,data}"
