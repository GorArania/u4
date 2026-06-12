# Ultima IV im Browser

Gerüst, um **Ultima IV: Quest of the Avatar** (DOS) per [js-dos](https://js-dos.com)
im Browser zu spielen – mit Node.js-Server, Benutzeranmeldung und
Spielstand-Speicherung pro Benutzer in SQLite.

## Schnellstart

```bash
npm install
# Original-DOS-Dateien in den Ordner game/ kopieren (siehe game/README.md)
npm start
```

Dann <http://localhost:3000> öffnen, Benutzer registrieren und losspielen.

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
