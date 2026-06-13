# xu4-web – Ultima IV (xu4-Engine) im Browser via WebAssembly

Ziel: Die moderne **xu4**-Engine (Quellcode unter `../xu4`) nach WebAssembly
kompilieren, damit Ultima IV mit **VGA-Grafik, Musik und Touch-Steuerung**
auf dem Handy im Browser läuft – als Alternative zur DOS-Version (die wegen
des Musik-Treibers INT 66h nicht browser-tauglich ist).

## Stand

| Schritt | Status |
| --- | --- |
| Emscripten-Toolchain + libxml2 (WASM) | ✅ |
| xu4-Quellcode nach WASM kompilieren + linken (79 Objekte → `u4.wasm`) | ✅ |
| Engine lädt Konfiguration + alle Spieldaten | ✅ |
| Web-Oberfläche: Canvas + Touch-Steuerung (Steuerkreuz + Befehlsraster) | ✅ (rendert) |
| Spiel rendert Grafik | ⛔ **offen** – siehe unten |

### Verbleibender Blocker: Paletten-Surfaces

xu4 rendert intern über **8-Bit-indizierte SDL-Surfaces mit Paletten**
(EGA 16 Farben / VGA 256 Farben, dazu Paletten-Effekte). Emscriptens
SDL-1.2-Emulation unterstützt **keine** indizierten Surfaces – sie behandelt
alles als 32-Bit-RGBA, der Paletten-Pfad ist auskommentiert und ruft an einer
Stelle sogar `abort()` auf (`src/lib/libsdl.js`). Folge: Beim ersten
Pixel-Schreiben (`Image::putPixelIndex`, ausgelöst vom Laden von
`CHARSET.EGA`) greift xu4 auf einen nicht angelegten Puffer einer
`SDL_HWSURFACE` zu → Segfault.

**Lösung (nächster Schritt):** Die Bild-/Paletten-Schicht in
`../xu4/src/image_sdl.cpp` so umbauen, dass „indizierte" Bilder als 32-Bit-RGBA
gehalten werden: Pixel als Index + separat gespeicherte Palette puffern und
beim Setzen der Palette bzw. vor dem Blit nach RGBA auflösen. Damit entfällt
die Abhängigkeit von Emscriptens fehlender Paletten-Unterstützung.

Diagnose-Werkzeug dafür ist vorhanden: headless Chromium (puppeteer-core)
lädt die Seite und macht Screenshots – analog zum Vorgehen bei der DOS-Version.

## Bauen

Voraussetzungen: Emscripten SDK aktiviert, libxml2 als WASM-Statiklib
(`$LIBXML2_WASM`, Standard `/opt/libxml2-wasm`).

```bash
source /opt/emsdk/emsdk_env.sh
./prepare-data.sh   # stellt dist/data/ aus ../game und ../xu4 zusammen
./build.sh          # kompiliert + linkt nach web/u4.{js,wasm,data}
```

Lokal testen:

```bash
cd web && python3 -m http.server 8090   # dann http://localhost:8090/
```

## Aufbau

- `../xu4/` – xu4-Engine-Quellcode (mit den Portierungs-Fixes für Clang/WASM)
- `web/` – Frontend: `index.html`, `xu4.css`, `xu4-ui.js` (Touch-Steuerung,
  Tastatur-Injektion, Spielstand-Persistenz über IDBFS)
- `prepare-data.sh` – baut das Datenverzeichnis (originale U4-Daten + VGA-Upgrade
  als `u4upgrad.zip` + Engine-Daten)
- `build.sh` – Emscripten-Build
- `dist/` – Build-Artefakte (nicht eingecheckt)

Die WASM-Build-Artefakte (`web/u4.js`, `web/u4.wasm`, `web/u4.data`) werden
nicht eingecheckt – sie enthalten die urheberrechtlich geschützten Spieldaten
und werden lokal vom Build erzeugt.
