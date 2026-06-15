/*
 * xu4-ui.js – Web-Oberfläche für die xu4-WASM-Engine.
 *
 *  - Anmeldung (Login/Passwort) über api.php
 *  - lädt vor dem Spielstart den serverseitigen Spielstand des Benutzers in das
 *    virtuelle Dateisystem (/save) und schiebt ihn nach dem Speichern zurück,
 *    sodass mehrere Benutzer ihr Spiel geräteübergreifend fortsetzen können
 *  - Touch-/Klick-Buttons werden auf Tastatureingaben abgebildet
 */

(function () {
  'use strict';

  var authScreen = document.getElementById('auth');
  var appScreen = document.getElementById('app');
  var authForm = document.getElementById('auth-form');
  var authError = document.getElementById('auth-error');
  var playerName = document.getElementById('player-name');
  var saveInfo = document.getElementById('save-info');
  var canvas = document.getElementById('canvas');

  var started = false;       // u4.js geladen?
  var engineRunning = false; // callMain aufgerufen?

  // ----------------------------------------------------------------- API
  async function api(path, options) {
    var res = await fetch(path, options || {});
    var isJson = (res.headers.get('content-type') || '').indexOf('application/json') !== -1;
    var body = isJson ? await res.json() : null;
    if (!res.ok) throw new Error(body && body.error ? body.error : 'Fehler ' + res.status);
    return body;
  }

  function showSaveInfo(stamp) {
    saveInfo.textContent = stamp
      ? 'Serverstand: ' + new Date(stamp + 'Z').toLocaleString('de-DE')
      : 'Noch kein Serverstand';
  }

  // ----------------------------------------------------- Anmeldung / Start
  authForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var action = e.submitter ? e.submitter.dataset.action : 'login';
    authError.hidden = true;
    try {
      await api('api/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authForm.username.value.trim(),
          password: authForm.password.value,
        }),
      });
      await enterGame();
    } catch (err) {
      authError.textContent = err.message;
      authError.hidden = false;
    }
  });

  document.getElementById('save-btn').addEventListener('click', async function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = '⏳ …';
    await uploadSave(true); // force = true, ignoriert Deduplizierung
    btn.disabled = false;
    btn.textContent = '💾 Speichern';
  });

  document.getElementById('logout-btn').addEventListener('click', async function () {
    await api('api/logout', { method: 'POST' }).catch(function () {});
    location.reload(); // sauberer Neustart der WASM-Instanz
  });

  async function enterGame() {
    var me = await api('api/me');
    if (!me.user) { authScreen.hidden = false; return; }
    authScreen.hidden = true;
    appScreen.hidden = false;
    playerName.textContent = me.user;
    showSaveInfo(me.saveUpdatedAt);
    if (!started) {
      started = true;
      // Layout abwarten, damit js-dos/SDL die Canvas-Größe kennt.
      requestAnimationFrame(loadEngine);
    }
  }

  // -------------------------------------------- Emscripten-Module + Engine
  window.Module = {
    canvas: canvas,
    noInitialRun: true, // Start erst nach Wiederherstellen des Spielstands
    arguments: [],
    print: function (t) { console.log(t); },
    printErr: function (t) { console.warn(t); },
    onRuntimeInitialized: function () { startEngine(); },
  };

  function loadEngine() {
    var s = document.createElement('script');
    s.src = 'u4.js';
    document.body.appendChild(s);
  }

  async function startEngine() {
    var FS = Module.FS;
    try { FS.mkdir('/save'); } catch (e) {}
    // Serverstand in /save wiederherstellen
    try {
      var res = await fetch('api/save');
      if (res.status === 200) {
        unpackSave(FS, new Uint8Array(await res.arrayBuffer()));
      }
    } catch (e) { console.warn('Spielstand laden fehlgeschlagen:', e); }
    var el = document.getElementById('loading');
    if (el) el.style.display = 'none';
    engineRunning = true;
    Module.callMain([]); // kehrt wegen ASYNCIFY nicht zurück
  }

  // -------------------------------------------- Spielstand serialisieren
  // Einfaches Containerformat: je Datei [u16 nameLen][name][u32 dataLen][data]
  function packSave(FS) {
    var names;
    try { names = FS.readdir('/save'); } catch (e) { return null; }
    var parts = [];
    var total = 0;
    names.forEach(function (name) {
      if (name === '.' || name === '..') return;
      var data;
      try {
        var st = FS.stat('/save/' + name);
        if (FS.isDir(st.mode)) return;
        data = FS.readFile('/save/' + name); // Uint8Array
      } catch (e) { return; }
      var nameBytes = new TextEncoder().encode(name);
      var head = new Uint8Array(2 + nameBytes.length + 4);
      var dv = new DataView(head.buffer);
      dv.setUint16(0, nameBytes.length);
      head.set(nameBytes, 2);
      dv.setUint32(2 + nameBytes.length, data.length);
      parts.push(head, data);
      total += head.length + data.length;
    });
    if (total === 0) return null;
    var out = new Uint8Array(total);
    var off = 0;
    parts.forEach(function (p) { out.set(p, off); off += p.length; });
    return out;
  }

  function unpackSave(FS, buf) {
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var off = 0;
    while (off + 6 <= buf.length) {
      var nameLen = dv.getUint16(off); off += 2;
      var name = new TextDecoder().decode(buf.subarray(off, off + nameLen)); off += nameLen;
      var dataLen = dv.getUint32(off); off += 4;
      var data = buf.subarray(off, off + dataLen); off += dataLen;
      try { FS.writeFile('/save/' + name, data); } catch (e) {}
    }
  }

  // -------------------------------------- Spielstand zum Server hochladen
  var lastUploadedSig = null;
  var saveTimer = null;
  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { uploadSave(false); }, 1500);
  }
  async function uploadSave(force) {
    if (!Module.FS || !engineRunning) return;
    var blob = packSave(Module.FS);
    if (!blob) return;
    var sig = blob.length + ':' + (blob[blob.length - 1] | 0) + ':' + (blob[0] | 0);
    if (!force && sig === lastUploadedSig) return; // nichts geändert
    try {
      var r = await api('api/save', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: blob,
      });
      lastUploadedSig = sig;
      showSaveInfo(r.updatedAt);
    } catch (e) { console.warn('Spielstand speichern fehlgeschlagen:', e); }
  }

  // ----------------------------------------- Tastatureingaben an SDL
  function makeKeyEvent(type, opts) {
    var ev = new KeyboardEvent(type, {
      bubbles: true, cancelable: true, view: window,
      key: opts.key, code: opts.code || '',
      location: 0, shiftKey: !!opts.shift,
    });
    ['keyCode', 'which', 'charCode'].forEach(function (p) {
      Object.defineProperty(ev, p, {
        get: function () { return p === 'charCode' ? (opts.charCode || 0) : opts.keyCode; },
      });
    });
    return ev;
  }
  function sendKey(spec) {
    document.dispatchEvent(makeKeyEvent('keydown', spec));
    if (spec.charCode) document.dispatchEvent(makeKeyEvent('keypress', spec));
    setTimeout(function () {
      document.dispatchEvent(makeKeyEvent('keyup', spec));
      persistSoon();
    }, 30);
  }
  var SPECIAL = {
    up:    { keyCode: 38, key: 'ArrowUp',    code: 'ArrowUp' },
    down:  { keyCode: 40, key: 'ArrowDown',  code: 'ArrowDown' },
    left:  { keyCode: 37, key: 'ArrowLeft',  code: 'ArrowLeft' },
    right: { keyCode: 39, key: 'ArrowRight', code: 'ArrowRight' },
    enter: { keyCode: 13, key: 'Enter',      code: 'Enter', charCode: 13 },
    space: { keyCode: 32, key: ' ',          code: 'Space', charCode: 32 },
    esc:   { keyCode: 27, key: 'Escape',     code: 'Escape' },
  };
  function pressLetter(ch) {
    var lower = ch.toLowerCase();
    sendKey({ keyCode: ch.toUpperCase().charCodeAt(0), charCode: lower.charCodeAt(0), key: lower, code: 'Key' + ch.toUpperCase() });
  }
  function pressDigit(d) {
    sendKey({ keyCode: 48 + d, charCode: 48 + d, key: String(d), code: 'Digit' + d });
  }

  document.querySelectorAll('#dpad .dir').forEach(function (btn) {
    btn.addEventListener('click', function () { sendKey(SPECIAL[btn.getAttribute('data-key')]); });
  });

  // ------------------------------------------- QWERTZ-Tastatur aufbauen
  var XU4 = {
    A:'Angriff', B:'Besteigen', C:'Zauber', D:'Hinab',
    E:'Betreten', F:'Feuern', G:'Nehmen', H:'Lager',
    I:'Fackel', J:'Knacken', K:'Klettern', L:'Schauen',
    M:'Mischen', N:'Reihenf.', O:'Öffnen', P:'Spähen',
    Q:'Speichern', R:'Waffe', S:'Suchen', T:'Reden',
    U:'Benutzen', V:'Lautst.', W:'Rüstung', X:'Absteigen',
    Y:'Rufen', Z:'Werte',
  };
  var ROWS = [
    ['Q','W','E','R','T','Z','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Y','X','C','V','B','N','M'],
  ];
  var kb = document.getElementById('keyboard');

  function makeRow(extraClass) {
    var row = document.createElement('div');
    row.className = 'kb-row' + (extraClass ? ' ' + extraClass : '');
    return row;
  }
  function addCmd(row, label, sub, cls, onclick) {
    var b = document.createElement('button');
    b.className = 'cmd' + (cls ? ' ' + cls : '');
    b.innerHTML = '<span class="k">' + label + '</span>' +
                  (sub ? '<span class="s">' + sub + '</span>' : '');
    b.addEventListener('click', onclick);
    row.appendChild(b);
  }

  // Ziffernzeile 1–9, 0 (oben)
  var numRow = makeRow();
  for (var d = 1; d <= 9; d++) {
    (function (n) { addCmd(numRow, String(n), '', '', function () { pressDigit(n); }); })(d);
  }
  addCmd(numRow, '0', '', '', function () { pressDigit(0); });
  kb.appendChild(numRow);

  // Buchstaben-Zeilen (QWERTZ)
  ROWS.forEach(function (keys) {
    var row = makeRow();
    keys.forEach(function (ch) {
      addCmd(row, ch, XU4[ch] || '', '', function () { pressLetter(ch); });
    });
    kb.appendChild(row);
  });

  // Sondertasten: Esc links, Leerzeichen Mitte, Enter rechts
  var specRow = makeRow();
  addCmd(specRow, 'Esc', 'Abbr.',  'wide',  function () { sendKey(SPECIAL.esc); });
  addCmd(specRow, '␣',   'Warten', 'xwide', function () { sendKey(SPECIAL.space); });
  addCmd(specRow, '↵',   'Enter',  'wide',  function () { sendKey(SPECIAL.enter); });
  kb.appendChild(specRow);

  // Physische Tastatureingaben lösen ebenfalls einen Spielstand-Upload aus.
  // (Touch-Buttons rufen persistSoon() bereits über sendKey() auf.)
  document.addEventListener('keyup', function () {
    if (engineRunning) persistSoon();
  });

  // Zusätzlicher periodischer Upload alle 60 s als Sicherheitsnetz
  setInterval(function () {
    if (engineRunning) uploadSave();
  }, 60000);

  // Die Canvas-Skalierung übernimmt jetzt komplett CSS (object-fit:contain),
  // das ist deutlich robuster als gegen Emscriptens Inline-Styles anzukämpfen.

  // Bestehende Sitzung weiterverwenden?
  enterGame().catch(function () { authScreen.hidden = false; });
})();
