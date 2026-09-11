# xu4-web – Ultima IV im Browser (WebAssembly)

Die **xu4**-Engine (Quellcode unter `../xu4`) nach WebAssembly kompiliert, damit
Ultima IV mit Grafik, **Musik** und **Touch-Steuerung** im Browser läuft – inkl.
**Anmeldung und Spielständen pro Benutzer** auf dem Server.

## Was funktioniert

- Animierte Intro-Sequenz, Hauptmenü, Charaktererschaffung, Spielsteuerung
- Musik (von MIDI nach OGG vorgerendert)
- Touch-Oberfläche: Steuerkreuz + Befehlsraster (fast jeder Buchstabe ein Befehl)
- **Anmeldung (Login/Passwort)** und **Spielstände pro Benutzer in SQLite** –
  mehrere Leute können geräteübergreifend weiterspielen

## Auf dem Server betreiben (Raspberry Pi, Apache + PHP)

Es werden **keine** weiteren Dienste benötigt (kein Node, keine js-dos). Die
gebauten Dateien (`web/u4.js`, `web/u4.wasm`, `web/u4.data`) sind eingecheckt,
und `u4.data` enthält auch die Spieldateien — der Ordner `game/` wird zum
Spielen nicht gebraucht.

Zwei Ausnahmen brauchen `game/` doch: ein Neubau (siehe unten) und der
Karten-Editor unter `public/`. Der extrahiert `shapes.vga` und `u4vga.pal`
für die VGA-Darstellung aus dem eingebetteten Upgrade-ZIP **nach `game/`** und
legt das Verzeichnis dabei nicht selbst an. Wer den Editor nutzen will,
erzeugt es einmal: `mkdir -p game && sudo chown www-data: game`.

Apache braucht `mod_rewrite` **und** `mod_headers`. Ohne `mod_headers`
scheitert er an den `Header`-Anweisungen in `web/.htaccess` und antwortet auf
jeden Aufruf mit Fehler 500.

Eine Datenbank muss niemand einrichten: SQLite braucht keinen Server, und
`api.php` legt `web/data/xu4web.sqlite` mit den Tabellen `users`, `saves` und
`user_maps` bei der ersten Anfrage selbst an. Passwörter landen als Hash
(`password_hash()`, derzeit bcrypt). Die Datei selbst bleibt dank
`.gitignore` ausserhalb des Repositories und wird von `web/.htaccess` nicht
ausgeliefert.

```bash
# 1) Neuesten Stand holen
cd /var/www/html/Ultima4
git pull

# 2) PHP sicherstellen (für Anmeldung/Spielstände)
sudo apt install -y php php-sqlite3 libapache2-mod-php

# 3) Apache einrichten (liefert /ultima4/ aus dem Spielordner)
sudo cp xu4-web/apache-ultima4.conf /etc/apache2/conf-available/ultima4.conf
sudo a2enmod rewrite headers
sudo a2enconf ultima4
sudo systemctl reload apache2

# 4) Schreibrechte für die Spielstand-Datenbank
sudo chown -R www-data: /var/www/html/Ultima4/xu4-web/web
```

Danach läuft das Spiel unter **https://<deine-domain>/ultima4/**.
Beim ersten Aufruf registrieren, dann spielen – der Spielstand wird pro
Benutzer auf dem Server gespeichert.

> Hinweis: Die alte DOS/js-dos-Version (Ordner `public/`, `server.js`, `lib/`)
> wird nicht mehr gebraucht. Wer den `/ultima4/`-Alias bisher dorthin zeigen
> ließ, ersetzt ihn durch die neue Konfiguration oben.

## Neu bauen (nur bei Code-/Daten-Änderungen)

Voraussetzungen: Emscripten SDK, libxml2 als WASM-Statiklib, fluidsynth +
GM-Soundfont + ffmpeg (für die Musik). Dazu die Original-DOS-Dateien in
`../game` — daraus stellt `prepare-data.sh` das Datenverzeichnis zusammen.

Auf einem Raspberry Pi (arm64) läuft der Build direkt, Emscripten liefert
arm64-Binaries: `./emsdk install latest-arm64-linux`. `build.sh` linkt mit
`em++` statt `emcc`, weil neuere Emscripten-Versionen libc++ beim Linken
nicht mehr automatisch dazuziehen. Mit `OUTDIR=...` baut das Skript in ein
Staging-Verzeichnis, ohne die ausgelieferten Dateien anzufassen. Siehe die
Skripte:

```bash
source /opt/emsdk/emsdk_env.sh
./convert-music.sh    # MIDI -> OGG (einmalig; Ergebnisse sind eingecheckt)
./prepare-data.sh     # Datenverzeichnis zusammenstellen
./build.sh            # nach web/u4.{js,wasm,data} bauen
```

## Aufbau

- `web/` – Frontend + gebautes Spiel + PHP-API
  - `index.html`, `xu4.css`, `xu4-ui.js` – Oberfläche, Steuerung, Anmeldung,
    Spielstand-Sync
  - `api.php`, `.htaccess` – Anmeldung + Spielstände (SQLite unter `web/data/`)
  - `u4.js`, `u4.wasm`, `u4.data` – das gebaute WebAssembly-Spiel
  - `router.php` – nur für lokales Testen mit `php -S`
- `build.sh`, `prepare-data.sh`, `convert-music.sh` – Build-Werkzeuge
- `web_sdl_timer.js`, `apache-ultima4.conf` – Build-/Deploy-Bausteine

## Technische Hinweise zur Portierung

Emscriptens SDL-1.2-Emulation erforderte mehrere Anpassungen (in `../xu4/src`):
indizierte Bilder als 32-Bit-RGBA mit eigener Palette; Surfaces vor Pixel-
zugriff sperren und vor Blits entsperren (Canvas-Sync); `SDL_AddTimer` als
periodischen Timer (`web_sdl_timer.js`); blockierende Hauptschleife via
ASYNCIFY. Details in der Git-Historie.
