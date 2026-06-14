/*
 * xu4-ui.js – Web-Oberfläche für die xu4-WASM-Engine.
 *
 * - richtet das Emscripten-Module ein (Canvas, Persistenz der Spielstände)
 * - bildet Touch-/Klick-Buttons auf Tastatureingaben ab, die die in WASM
 *   laufende SDL-1.2-Schicht erwartet.
 */

(function () {
  'use strict';

  var canvas = document.getElementById('canvas');

  // --- Emscripten-Module ---------------------------------------------------
  window.Module = {
    canvas: canvas,
    // Audio an: Musik wurde von MIDI nach OGG vorgerendert (Browser kann OGG
    // dekodieren). Audio startet evtl. erst nach der ersten Nutzerinteraktion
    // (Autoplay-Richtlinie der Browser).
    arguments: [],
    preRun: [],
    print: function (t) { console.log(t); },
    printErr: function (t) { console.warn(t); },
    setStatus: function (t) {
      var el = document.getElementById('loading');
      if (el) el.style.display = t ? 'block' : 'none';
    },
    onRuntimeInitialized: function () {
      var el = document.getElementById('loading');
      if (el) el.style.display = 'none';
    },
  };

  // Spielstände im Browser persistieren: IDBFS an /u4-save mounten und xu4 so
  // konfigurieren, dass es dort speichert (siehe Suchpfade). Bei Start laden,
  // nach jeder Eingabe verzögert sichern.
  Module.preRun.push(function () {
    try {
      var FS = Module.FS;
      FS.mkdir('/save');
      FS.mount(FS.filesystems.IDBFS, {}, '/save');
      FS.syncfs(true, function () {});
    } catch (e) { console.warn('IDBFS nicht verfügbar:', e); }
  });

  var saveTimer = null;
  function persistSoon() {
    if (!Module.FS) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { Module.FS.syncfs(false, function () {}); } catch (e) {}
    }, 1500);
  }

  // --- Tastatureingaben an SDL schicken ------------------------------------
  // Synthetische KeyboardEvents liefern keyCode/charCode normalerweise als 0;
  // wir erzwingen die Werte per defineProperty, sonst ignoriert SDL sie.
  function makeKeyEvent(type, opts) {
    var ev = new KeyboardEvent(type, {
      bubbles: true, cancelable: true, view: window,
      key: opts.key, code: opts.code || '',
      location: 0, ctrlKey: false, altKey: false, shiftKey: !!opts.shift, metaKey: false,
    });
    ['keyCode', 'which', 'charCode'].forEach(function (p) {
      Object.defineProperty(ev, p, {
        get: function () { return p === 'charCode' ? (opts.charCode || 0) : opts.keyCode; },
      });
    });
    return ev;
  }

  function sendKey(spec) {
    var target = document; // SDL lauscht standardmäßig am document
    target.dispatchEvent(makeKeyEvent('keydown', spec));
    if (spec.charCode) target.dispatchEvent(makeKeyEvent('keypress', spec));
    setTimeout(function () {
      target.dispatchEvent(makeKeyEvent('keyup', spec));
      persistSoon();
    }, 30);
  }

  // Bewegung / Sondertasten
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
    sendKey({
      keyCode: ch.toUpperCase().charCodeAt(0),
      charCode: lower.charCodeAt(0),
      key: lower,
      code: 'Key' + ch.toUpperCase(),
    });
  }

  function pressDigit(d) {
    sendKey({ keyCode: 48 + d, charCode: 48 + d, key: String(d), code: 'Digit' + d });
  }

  // --- Steuerkreuz verdrahten ---------------------------------------------
  document.querySelectorAll('#dpad .dir').forEach(function (btn) {
    var k = btn.getAttribute('data-key');
    btn.addEventListener('click', function () { sendKey(SPECIAL[k]); });
  });

  // --- Befehlsraster aufbauen ---------------------------------------------
  // In Ultima IV ist nahezu jeder Buchstabe ein Befehl.
  var COMMANDS = [
    ['A', 'Angriff'], ['B', 'Besteigen'], ['C', 'Zauber'], ['D', 'Hinab'],
    ['E', 'Betreten'], ['F', 'Feuern'], ['G', 'Nehmen'], ['H', 'Lager'],
    ['I', 'Fackel'], ['J', 'Knacken'], ['K', 'Klettern'], ['L', 'Schauen'],
    ['M', 'Mischen'], ['N', 'Reihenf.'], ['O', 'Öffnen'], ['P', 'Spähen'],
    ['Q', 'Speichern'], ['R', 'Waffe'], ['S', 'Suchen'], ['T', 'Reden'],
    ['U', 'Benutzen'], ['V', 'Lautst.'], ['W', 'Rüstung'], ['X', 'Absteigen'],
    ['Y', 'Rufen'], ['Z', 'Werte'],
  ];

  var grid = document.getElementById('commands');

  function addButton(label, sub, onclick) {
    var b = document.createElement('button');
    b.className = 'cmd';
    b.innerHTML = '<span class="k">' + label + '</span><span class="s">' + sub + '</span>';
    b.addEventListener('click', onclick);
    grid.appendChild(b);
  }

  COMMANDS.forEach(function (c) {
    addButton(c[0], c[1], function () { pressLetter(c[0]); });
  });
  addButton('␣', 'Warten', function () { sendKey(SPECIAL.space); });
  addButton('Esc', 'Abbr.', function () { sendKey(SPECIAL.esc); });
  for (var d = 1; d <= 8; d++) {
    (function (n) { addButton(String(n), '', function () { pressDigit(n); }); })(d);
  }
})();
