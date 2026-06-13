const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const GAME_DIR = path.join(__dirname, '..', 'game');

// Dateien im game/-Ordner, die nicht zum Spiel gehören.
const IGNORED = new Set(['readme.md', '.gitkeep', 'autoexec.txt', 'u4upgrad.zip']);

function walk(dir, base = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...walk(path.join(dir, entry.name), rel));
    } else if (!base && IGNORED.has(entry.name.toLowerCase())) {
      continue;
    } else {
      files.push(rel);
    }
  }
  return files;
}

function listGameFiles() {
  if (!fs.existsSync(GAME_DIR)) return [];
  return walk(GAME_DIR);
}

// Bevorzugte Startdateien, falls keine game/autoexec.txt vorhanden ist.
const START_CANDIDATES = [
  'run.bat', 'start.bat',
  'ultima.exe', 'ultima.com', 'ultima4.exe', 'u4.exe', 'u4.com',
  'avatar.exe', 'game.exe',
];

// Hilfsprogramme (z. B. aus dem VGA/MIDI-Upgrade), die nie als Startdatei
// herhalten sollen.
const NOT_A_GAME = /^(avpatch\.exe|setm\.exe|setup\.bat|switch\.bat|.?midpak\.com)$/i;

function detectStartCommand(files) {
  const rootFiles = files.filter((f) => !f.includes('/'));
  for (const candidate of START_CANDIDATES) {
    const hit = rootFiles.find((f) => f.toLowerCase() === candidate);
    if (hit) return hit;
  }
  return (
    rootFiles.find((f) => /\.(exe|com|bat)$/i.test(f) && !NOT_A_GAME.test(f)) || null
  );
}

function autoexecLines(files) {
  const custom = path.join(GAME_DIR, 'autoexec.txt');
  if (fs.existsSync(custom)) {
    return fs.readFileSync(custom, 'utf8').split(/\r?\n/).filter(Boolean);
  }
  const lines = ['mount c .', 'c:'];

  // Ultima IV: NICHT über ULTIMA.COM starten. Dessen Verkettung
  // TITLE.EXE -> AVATAR.EXE scheitert unter dem WASM-DOSBox-X (das Spiel
  // fällt auf den DOS-Prompt zurück). Stattdessen Titel/Charaktererschaffung
  // und das eigentliche Spiel direkt nacheinander aufrufen.
  const rootLower = files.filter((f) => !f.includes('/')).map((f) => f.toLowerCase());
  if (rootLower.includes('avatar.exe') && rootLower.includes('title.exe')) {
    lines.push('TITLE.EXE', 'AVATAR.EXE', 'exit');
    return lines;
  }

  const start = detectStartCommand(files);
  if (start) {
    lines.push(start.toUpperCase());
    // Nach Spielende den Emulator beenden statt einen DOS-Prompt zu zeigen.
    lines.push('exit');
  } else {
    lines.push('echo Keine Startdatei (.exe/.com/.bat) gefunden.');
    lines.push('echo Lege eine game/autoexec.txt mit den Startbefehlen an.');
  }
  return lines;
}

function dosboxConf(files) {
  return [
    '[sdl]',
    'autolock=true',
    '',
    '[render]',
    'aspect=true',
    '',
    '[cpu]',
    // Ultima IV (1987) verträgt den dynamischen Kern und hohe Taktraten
    // schlecht; fester Normal-Kern mit niedriger Taktrate läuft stabil.
    'core=normal',
    'cputype=386',
    'cycles=fixed 3000',
    '',
    '[autoexec]',
    ...autoexecLines(files),
    '',
  ].join('\n');
}

/**
 * Baut ein .jsdos-Bundle (ZIP) aus dem game/-Ordner. Liegt ein Spielstand vor
 * (das "changes"-ZIP aus ci.persist() von js-dos), werden dessen Dateien über
 * die Originaldateien gelegt, sodass der Stand beim Laden wiederhergestellt ist.
 */
function buildBundle(saveBlob = null) {
  const files = listGameFiles();
  if (files.length === 0) {
    const err = new Error(
      'Der game/-Ordner ist leer. Bitte die originalen Ultima-IV-DOS-Dateien dorthin kopieren.'
    );
    err.code = 'EMPTY_GAME_DIR';
    throw err;
  }

  const entries = new Map();
  for (const rel of files) {
    entries.set(rel, fs.readFileSync(path.join(GAME_DIR, rel)));
  }
  entries.set('.jsdos/dosbox.conf', Buffer.from(dosboxConf(files), 'utf8'));

  if (saveBlob) {
    const changes = new AdmZip(Buffer.from(saveBlob));
    for (const entry of changes.getEntries()) {
      if (entry.isDirectory) continue;
      entries.set(entry.entryName.replace(/\\/g, '/'), entry.getData());
    }
  }

  const zip = new AdmZip();
  for (const [name, data] of entries) {
    zip.addFile(name, data);
  }
  return zip.toBuffer();
}

module.exports = { GAME_DIR, listGameFiles, buildBundle };
