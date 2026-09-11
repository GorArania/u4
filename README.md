# Ultima IV im Browser 🎮

**Ultima IV: Quest of the Avatar** (1987, DOS) läuft vollständig im Browser –
mit Musik, Touch-Steuerung und serverseitiger Spielstand-Speicherung pro
Benutzer.

## Live-Demo

👉 **[Jetzt spielen auf goraran.de](https://goraran.de/ultima4/)**

---

## Zwei Implementierungen

Dieses Repository enthält zwei unabhängige Versionen, die dieselben
Originalspiel-Dateien nutzen:

### ✅ Aktuelle Version: xu4-web (WebAssembly)

Verzeichnis: `xu4-web/`

Die xu4-Engine (C++-Quellcode unter `xu4/`) wurde mit Emscripten nach
WebAssembly kompiliert. Kein DOSBox, kein Node.js — läuft direkt unter
Apache mit PHP.

**Was funktioniert:**
- Vollständiges Spiel inkl. animierter Intro-Sequenz, Charaktererschaffung
  und Spielwelt
- Musik (MIDI nach OGG vorgerendert)
- Touch-Steuerung: Steuerkreuz + Befehlsraster (fast jeder Buchstabe ein
  Befehl)
- Anmeldung (Login/Passwort) und Spielstände pro Benutzer in SQLite —
  geräteübergreifend verfügbar

### ⚠️ Ältere Version: js-dos / DOSBox (veraltet)

Verzeichnisse: `public/`, `server.js`, `lib/`

Die ursprüngliche Implementierung über den js-dos-Emulator (v8, DOSBox-X-Kern)
mit Node.js- oder PHP-Backend. Funktioniert, wird aber nicht mehr
weiterentwickelt. Technische Einschränkungen:

- VGA/MIDI-Upgrade läuft nicht (AIL/MIDPAK über INT 66h wird vom
  WASM-DOSBox-X nicht unterstützt → Absturz)
- `ULTIMA.COM` kann nicht genutzt werden (Verkettung `TITLE.EXE` →
  `AVATAR.EXE` schlägt im WASM-DOSBox-X fehl); `TITLE.EXE` und `AVATAR.EXE`
  werden direkt aufgerufen
- Kein WebAssembly-nativer Sound; kein Touch

---

## Schnellstart (xu4-web, empfohlen)

Voraussetzungen: Apache mit `mod_rewrite` und `mod_headers`, PHP ≥ 7.4 mit
`pdo_sqlite`. `mod_headers` ist zwingend — ohne es scheitert Apache an den
`Header`-Anweisungen in `xu4-web/web/.htaccess` und liefert bei jedem Aufruf
einen Fehler 500.

Ein Build-Schritt ist **nicht** nötig: die gebauten WebAssembly-Dateien
(`u4.js`, `u4.wasm`, `u4.data`) sind eingecheckt, und `u4.data` enthält auch
die Spieldateien. Eine Datenbank muss ebenfalls niemand anlegen — SQLite
braucht keinen Server, und `api.php` erzeugt `xu4-web/web/data/xu4web.sqlite`
samt Tabellen bei der ersten Anfrage selbst.

```bash
# 1) Repository klonen
git clone https://github.com/GorArania/UltimaIV.git /var/www/html/Ultima4
cd /var/www/html/Ultima4

# 2) PHP sicherstellen
sudo apt install -y php php-sqlite3 libapache2-mod-php

# 3) Apache einrichten
sudo cp xu4-web/apache-ultima4.conf /etc/apache2/conf-available/ultima4.conf
sudo a2enmod rewrite headers
sudo a2enconf ultima4
sudo systemctl reload apache2

# 4) Schreibrechte für Datenbank und Spielstände
sudo chown -R www-data: /var/www/html/Ultima4/xu4-web/web
```

Danach läuft das Spiel unter `https://<deine-domain>/ultima4/`.
Beim ersten Aufruf registrieren, dann spielen.

Das war alles. Die Original-DOS-Dateien muss man **nicht** besorgen: sie
stecken in `u4.data`, und die aktive Version greift auf den Ordner `game/`
überhaupt nicht zu. Gebraucht wird er nur für einen Neubau (siehe unten) und
für den Karten-Editor unter `public/`, der seine VGA-Grafikdateien dorthin
entpackt, ohne das Verzeichnis selbst anzulegen — dafür einmal
`mkdir -p game && sudo chown www-data: game`.

---

## Projektstruktur

```
├── xu4-web/                        # Aktuelle WebAssembly-Version (empfohlen)
│   ├── web/
│   │   ├── index.html              # Spielseite (Oberfläche, Touch, Anmeldung)
│   │   ├── xu4-ui.js               # Touch-Steuerung, Login, Spielstand-Sync
│   │   ├── xu4.css                 # Styling
│   │   ├── api.php                 # Anmeldung + Spielstände (SQLite)
│   │   ├── .htaccess               # URL-Routing
│   │   ├── router.php              # Lokales Testen mit php -S
│   │   ├── u4.js                   # Gebauter WebAssembly-Wrapper
│   │   ├── u4.wasm                 # Gebautes WebAssembly-Modul
│   │   └── u4.data                 # Gebautes Daten-Bundle
│   ├── apache-ultima4.conf         # Apache-Konfiguration
│   ├── build.sh                    # Kompiliert xu4 nach WASM
│   ├── prepare-data.sh             # Stellt Datenverzeichnis zusammen
│   ├── convert-music.sh            # MIDI → OGG
│   ├── web_sdl_timer.js            # SDL-Timer-Patch für Emscripten
│   └── README.md                   # Detaillierte Bau-Dokumentation
│
├── xu4/                            # xu4-Engine (C++-Quellcode)
│   ├── src/                        # Engine-Quellcode (angepasst für WASM)
│   ├── conf/                       # Spielkonfigurationen
│   ├── graphics/                   # Grafik-Assets
│   └── sound/                      # Sound-Assets
│
├── game/                           # Original-DOS-Dateien (nicht im Repo, .gitignore)
│   ├── AVATAR.EXE                  # Hauptspiel
│   ├── TITLE.EXE                   # Titelbildschirm + Charaktererschaffung
│   └── ...                         # Weitere Original-DOS-Dateien
│
├── public/                         # Ältere js-dos-Version (veraltet)
│   ├── index.html
│   ├── api.php
│   ├── app.js
│   └── style.css
│
├── lib/                            # Node.js-Backend (ältere Version)
│   ├── auth.js                     # Authentifizierung (scrypt)
│   ├── bundle.js                   # js-dos-Bundle-Erzeugung
│   └── db.js                       # SQLite-Datenbankzugriff
│
├── apache/
│   └── ultima4.conf                # Apache-Konfiguration (ältere Version)
│
├── server.js                       # Node.js-Server (ältere Version)
└── package.json                    # NPM-Abhängigkeiten (ältere Version)
```

---

## Spielstand speichern (xu4-web)

Der Spielstand wird automatisch gespeichert wenn das Spiel intern speichert.
Zusätzlich gibt es oben auf der Seite den Button **„Spielstand speichern"** für
ein manuelles Backup.

In Ultima IV speichert man auf der Oberwelt mit **Q** (Quit & Save) —
das schreibt `PARTY.SAV`.

---

## API-Übersicht (beide Versionen)

| Methode | Pfad            | Beschreibung                                  |
|---------|-----------------|-----------------------------------------------|
| POST    | `/api/register` | Benutzer anlegen (meldet direkt an)           |
| POST    | `/api/login`    | Anmelden (setzt HttpOnly-Session-Cookie)      |
| POST    | `/api/logout`   | Abmelden                                      |
| GET     | `/api/me`       | Angemeldeter Benutzer + Spielstand-Zeitstempel|
| GET     | `/api/bundle`   | Spiel-Bundle inkl. eigenem Spielstand         |
| PUT     | `/api/save`     | Spielstand hochladen                          |
| GET     | `/api/save`     | Spielstand als Backup herunterladen           |
| DELETE  | `/api/save`     | Spielstand auf dem Server löschen             |

---

## xu4-web neu bauen (nur bei Code-Änderungen nötig)

Die gebauten WASM-Dateien sind bereits eingecheckt. Ein Neubau ist nur
nötig, wenn der C++-Code oder die Spieldaten geändert wurden.

Voraussetzungen: Emscripten SDK, libxml2 als WASM-Statiklib, fluidsynth +
GM-Soundfont + ffmpeg (für die Musik). Dazu die Original-DOS-Dateien in
`game/` — `prepare-data.sh` stellt daraus das Datenverzeichnis zusammen.

Auf einem Raspberry Pi (arm64) läuft der Build direkt: `./emsdk install
latest-arm64-linux`. Gelinkt wird mit `em++`, nicht mit `emcc` — neuere
Emscripten-Versionen ziehen libc++ beim Linken nicht mehr automatisch dazu.

```bash
source /opt/emsdk/emsdk_env.sh
./xu4-web/convert-music.sh    # MIDI → OGG (einmalig)
./xu4-web/prepare-data.sh     # Datenverzeichnis zusammenstellen
./xu4-web/build.sh            # → xu4-web/web/u4.{js,wasm,data}
```

---

## Technische Hinweise zur xu4-WASM-Portierung

Die Portierung der xu4-Engine auf Emscripten erforderte mehrere Anpassungen
(in `xu4/src/`):

- **Grafik:** Indizierte Bilder als 32-Bit-RGBA mit eigener Palette;
  Surfaces vor Pixelzugriff sperren und vor Blits entsperren (Canvas-Sync)
- **Timer:** `SDL_AddTimer` als periodischer Timer (`web_sdl_timer.js`)
- **Hauptschleife:** Blockierend via ASYNCIFY
- **Musik:** MIDI nach OGG vorgerendert, da MIDI im Browser nicht verfügbar

Details in der Git-Historie und in `xu4-web/README.md`.

---

## Copyright-Hinweis

Ultima IV: Quest of the Avatar ist © 1987 Origin Systems / Electronic Arts.
Das Spiel wurde als Freeware freigegeben und kann legal heruntergeladen
werden, z. B. bei [GOG.com](https://www.gog.com/game/ultima_4).

Der Ordner `game/` mit den DOS-Dateien liegt nicht im Repository. Das
eingecheckte `u4.data` enthält sie allerdings eingebettet (248 Dateien plus
das VGA-Upgrade-ZIP) — anders könnte das Spiel im Browser nicht laufen.

xu4 ist Open Source (GPL), Quellcode: [xu4.sourceforge.net](https://xu4.sourceforge.net)
