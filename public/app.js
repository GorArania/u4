/* global Dos */

const authScreen = document.getElementById('auth-screen');
const gameScreen = document.getElementById('game-screen');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const playerName = document.getElementById('player-name');
const saveInfo = document.getElementById('save-info');
const saveBtn = document.getElementById('save-btn');
const downloadBtn = document.getElementById('download-btn');
const resetBtn = document.getElementById('reset-btn');
const logoutBtn = document.getElementById('logout-btn');
const gameMessage = document.getElementById('game-message');

let dosProps = null; // Rückgabe von Dos(), für stop()
let dosCi = null;       // js-dos CommandInterface, gesetzt sobald der Emulator läuft

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error(body && body.error ? body.error : `Fehler ${res.status}`);
  }
  return body;
}

function showSaveInfo(updatedAt) {
  saveInfo.textContent = updatedAt
    ? `Spielstand vom ${new Date(updatedAt + 'Z').toLocaleString('de-DE')}`
    : 'Noch kein Spielstand auf dem Server';
}

function showMessage(text) {
  gameMessage.textContent = text;
  gameMessage.hidden = !text;
}

// ---------------------------------------------------------------- Anmeldung

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const action = event.submitter ? event.submitter.dataset.action : 'login';
  authError.hidden = true;
  try {
    await api(`api/${action}`, {
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

logoutBtn.addEventListener('click', async () => {
  await stopGame();
  await api('api/logout', { method: 'POST' }).catch(() => {});
  gameScreen.hidden = true;
  authScreen.hidden = false;
  authForm.password.value = '';
});

// ---------------------------------------------------------------- Spielstart

async function enterGame() {
  const me = await api('api/me');
  authScreen.hidden = true;
  gameScreen.hidden = false;
  playerName.textContent = me.username;
  showSaveInfo(me.saveUpdatedAt);

  if (!me.gameFilesPresent) {
    showMessage(
      'Der game/-Ordner auf dem Server ist leer.\n\n' +
        'Bitte die originalen Ultima-IV-DOS-Dateien in den Ordner game/ kopieren ' +
        'und die Seite neu laden.'
    );
    return;
  }

  showMessage('');
  // Erst nach dem Layout starten, damit js-dos die Container-Größe kennt
  // (sonst bleibt die eingebettete Ansicht bis zum Vollbild leer).
  requestAnimationFrame(() => startEmulator(me.saveUpdatedAt));
}

function startEmulator(saveStamp) {
  // Zeitstempel in der URL, damit js-dos nach jedem Speichern/Löschen das
  // frische Bundle lädt statt eines lokal zwischengespeicherten Standes.
  const bundleUrl = `api/bundle?v=${encodeURIComponent(saveStamp || 'neu')}`;
  dosProps = Dos(document.getElementById('dos'), {
    url: bundleUrl,
    autoStart: true,
    theme: 'dark',
    noCloud: true,
    // DOSBox-X emuliert Ultima IV korrekt; der Standard-Kern ("dosbox")
    // stürzt ab ("index out of bounds").
    backend: 'dosboxX',
    onEvent: (event, arg) => {
      if (event === 'ci-ready') {
        dosCi = arg;
        saveBtn.disabled = false;
      }
      if (event === 'exit') {
        dosCi = null;
        saveBtn.disabled = true;
      }
    },
  });
}

async function stopGame() {
  saveBtn.disabled = true;
  dosCi = null;
  if (dosProps) {
    try {
      await dosProps.stop();
    } catch (_) {
      /* Emulator war ggf. schon beendet */
    }
    dosProps = null;
  }
}

// -------------------------------------------------------------- Spielstände

saveBtn.addEventListener('click', async () => {
  if (!dosCi) return;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Speichere …';
  try {
    const changes = await dosCi.persist();
    const result = await api('api/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: changes,
    });
    showSaveInfo(result.updatedAt);
  } catch (err) {
    alert(`Speichern fehlgeschlagen: ${err.message}`);
  } finally {
    saveBtn.textContent = 'Spielstand speichern';
    saveBtn.disabled = !dosCi;
  }
});

downloadBtn.addEventListener('click', async () => {
  const res = await fetch('api/save');
  if (!res.ok) {
    alert('Es liegt noch kein Spielstand auf dem Server.');
    return;
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `u4-spielstand-${playerName.textContent}.zip`;
  link.click();
  URL.revokeObjectURL(url);
});

resetBtn.addEventListener('click', async () => {
  if (!confirm('Spielstand auf dem Server wirklich löschen?')) return;
  try {
    await api('api/save', { method: 'DELETE' });
    await stopGame();
    await enterGame();
  } catch (err) {
    alert(`Löschen fehlgeschlagen: ${err.message}`);
  }
});

// Beim Laden der Seite: bestehende Session weiterverwenden.
(async () => {
  try {
    await api('api/me');
    await enterGame();
  } catch (_) {
    authScreen.hidden = false;
  }
})();
