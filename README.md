# Ultima IV im Browser

Gerüst, um **Ultima IV: Quest of the Avatar** (DOS) per [js-dos](https://js-dos.com)
im Browser zu spielen – mit Benutzeranmeldung und Spielstand-Speicherung pro
Benutzer in SQLite. Das Backend gibt es in zwei austauschbaren Varianten:

- **Node.js** (`server.js` + `lib/`): eigenständiger Server, `npm start`.
- **PHP** (`public/api.php` + `public/.htaccess`): läuft direkt unter Apache,
  kein Node nötig. Apache-Konfiguration: siehe `apache/ultima4.conf`.

Beide nutzen dieselbe Spielseite (`public/`), dieselbe API und dieselbe
Datenbankdatei (`data/u4web.sqlite`). Wichtig: Die Passwort-Hashes der beiden
Varianten sind nicht kompatibel (Node: scrypt, PHP: bcrypt) – beim Wechsel
müssen sich Benutzer neu registrieren (am einfachsten vorher
`data/u4web.sqlite` löschen).

## Schnellstart (Node.js)

```bash
npm install
# Original-DOS-Dateien in den Ordner game/ kopieren (siehe game/README.md)
npm start
```

Dann <http://localhost:3000> öffnen, Benutzer registrieren und losspielen.

## Schnellstart (Apache + PHP)

Benötigt PHP ≥ 7.4 mit `pdo_sqlite` und `zip` (Pakete `php-sqlite3`, `php-zip`)
sowie `mod_rewrite`. Projekt z. B. nach `/var/www/html/Ultima4` legen, dann:

```bash
sudo apt install -y php php-sqlite3 php-zip libapache2-mod-php
sudo cp apache/ultima4.conf /etc/apache2/conf-available/ultima4.conf
sudo a2enmod rewrite
sudo a2enconf ultima4
sudo systemctl reload apache2
sudo chown -R www-data: /var/www/html/Ultima4
```

Das Spiel läuft dann unter `http://<server>/ultima4/`. Die Konfiguration
sperrt zugleich den direkten Zugriff auf das Projektverzeichnis
(Datenbank, Spieldateien), das sonst über den DocumentRoot erreichbar wäre.

## Wie es funktioniert

- **Frontend** (`public/`): Login-/Registrierungsseite und Spielseite. Der
  js-dos-Player (v8, per CDN eingebunden) lädt das Spiel-Bundle vom Server.
- **Server** (`server.js`, `lib/`): Express-App.
  - `GET /api/bundle` packt den Inhalt von `game/` zur Laufzeit in ein
    `.jsdos`-Bundle (ZIP mit generierter `dosbox.conf`). Liegt für den
    Benutzer ein Spielstand vor, werden dessen Dateien über die
    Originaldateien gelegt – der Stand ist beim Laden sofort aktiv.
  - `PUT /api/save` speichert den Spielstand: Der Browser ruft
    `ci.persist()` von js-dos auf (liefert ein ZIP aller im Emulator
    geänderten Dateien, u. a. `PARTY.SAV`) und schickt es an den Server.
  - Spielstände, Benutzer und Sessions liegen in `data/u4web.sqlite`
    (better-sqlite3, wird beim ersten Start angelegt).
- **Spieldateien** (`game/`): Hier die originalen DOS-Dateien ablegen; sie
  sind per `.gitignore` vom Repository ausgenommen.

## Spielstand speichern

1. Im Spiel speichern (Ultima IV: auf der Oberwelt <kbd>Q</kbd> für
   „Quit & Save“ – das schreibt `PARTY.SAV`).
2. Oben auf **„Spielstand speichern“** klicken – erst damit landet der Stand
   auf dem Server und ist auf jedem Gerät verfügbar.

## API-Übersicht

| Methode | Pfad            | Beschreibung                                  |
| ------- | --------------- | --------------------------------------------- |
| POST    | `/api/register` | Benutzer anlegen (meldet direkt an)           |
| POST    | `/api/login`    | Anmelden (setzt HttpOnly-Session-Cookie)      |
| POST    | `/api/logout`   | Abmelden                                      |
| GET     | `/api/me`       | Angemeldeter Benutzer + Spielstand-Zeitstempel |
| GET     | `/api/bundle`   | js-dos-Bundle inkl. eigenem Spielstand        |
| PUT     | `/api/save`     | Spielstand hochladen (ZIP aus `ci.persist()`) |
| GET     | `/api/save`     | Spielstand als Backup herunterladen           |
| DELETE  | `/api/save`     | Spielstand auf dem Server löschen             |

## Hinweise

- Passwörter werden mit scrypt gehasht; Sessions laufen nach 30 Tagen ab.
- Hinter HTTPS in `lib/auth.js` beim Session-Cookie zusätzlich `Secure`
  setzen (siehe Kommentar dort).
- Der js-dos-Player wird von `v8.js-dos.com` geladen; für einen Betrieb ohne
  Internetzugang die Dateien `js-dos.js`/`js-dos.css` (samt Emulator-Assets)
  lokal in `public/` ablegen und die Pfade in `public/index.html` anpassen.
- Startbefehl anpassbar über `game/autoexec.txt` (siehe `game/README.md`).

## Emulator-Hinweise (Ultima IV)

Erkenntnisse aus dem Reproduzieren im DOSBox-X-Kern:

- **Kern:** Es wird `backend: 'dosboxX'` genutzt. Der Standard-Kern (`dosbox`)
  stürzt bei Ultima IV mit „index out of bounds" ab.
- **Start ohne `ULTIMA.COM`:** Der Original-Launcher `ULTIMA.COM` verkettet
  `TITLE.EXE` → `AVATAR.EXE`; diese Verkettung scheitert unter dem
  WASM-DOSBox-X (das Spiel fällt nach „Journey Onward"/Charaktererschaffung
  auf den DOS-Prompt zurück). Der Autostart ruft daher `TITLE.EXE`
  (Titel + Charaktererschaffung) und `AVATAR.EXE` (Spielwelt) direkt
  nacheinander auf. Das ist in `lib/bundle.js` bzw. `public/api.php`
  fest hinterlegt, sobald `AVATAR.EXE` + `TITLE.EXE` im `game/`-Stamm liegen.
- **CPU:** `core=normal`, `cputype=386`, `cycles=fixed 3000` – das 1987er-Spiel
  läuft mit dem dynamischen Kern / `cycles=auto` instabil.
- **VGA/MIDI-Upgrade läuft NICHT im Browser:** Die gepatchte `AVATAR.EXE` aus
  `game/upgrade/` benötigt den residenten Musik-Treiber (AIL/MIDPAK über
  INT 66h). Dieser Interrupt wird vom WASM-DOSBox-X nicht unterstützt
  („Illegal Unhandled Interrupt Called 66") → sofortiger Absturz. Es läuft
  daher die Original-EGA-Version. Die Upgrade-Dateien bleiben im Repo, werden
  aber nicht gestartet.
