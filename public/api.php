<?php
/**
 * Ultima IV im Browser – PHP-Backend (Apache-Variante).
 *
 * Ersetzt den Node.js-Server: gleiche API, gleiche Datenbankdatei
 * (data/u4web.sqlite), gleiche Spielseite. Die URLs api/register,
 * api/login, ... werden per .htaccess auf dieses Skript umgeschrieben.
 *
 * Benötigt: PHP >= 7.4 mit pdo_sqlite (php-sqlite3) und ZipArchive (php-zip).
 */

define('DATA_DIR', __DIR__ . '/../data');
define('GAME_DIR', __DIR__ . '/../game');
define('MAX_SAVE_BYTES', 16 * 1024 * 1024);
define('SESSION_MAX_AGE', 30 * 24 * 60 * 60);

// ------------------------------------------------------------------ Helfer

function json_out($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

function fail($message, $status) {
    json_out(array('error' => $message), $status);
}

function read_json_body() {
    $body = json_decode(file_get_contents('php://input'), true);
    return is_array($body) ? $body : array();
}

function db() {
    static $pdo = null;
    if ($pdo === null) {
        if (!is_dir(DATA_DIR)) {
            mkdir(DATA_DIR, 0775, true);
        }
        $pdo = new PDO('sqlite:' . DATA_DIR . '/u4web.sqlite');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        )");
        $pdo->exec("CREATE TABLE IF NOT EXISTS saves (
            user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            data       BLOB NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )");
    }
    return $pdo;
}

function current_user() {
    if (empty($_SESSION['uid'])) {
        return null;
    }
    $stmt = db()->prepare('SELECT id, username FROM users WHERE id = ?');
    $stmt->execute(array($_SESSION['uid']));
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user ?: null;
}

function require_auth() {
    $user = current_user();
    if (!$user) {
        fail('Nicht angemeldet.', 401);
    }
    return $user;
}

// ------------------------------------------------------- Spiel-Bundle (ZIP)

// Dateien im game/-Ordner, die nicht zum Spiel gehören.
function ignored_root_files() {
    return array('readme.md', '.gitkeep', 'autoexec.txt', 'u4upgrad.zip');
}

function list_game_files($dir = GAME_DIR, $base = '') {
    $files = array();
    if (!is_dir($dir)) {
        return $files;
    }
    foreach (scandir($dir) as $name) {
        if ($name === '.' || $name === '..' || $name[0] === '.') {
            continue;
        }
        $rel = $base === '' ? $name : $base . '/' . $name;
        $path = $dir . '/' . $name;
        if (is_dir($path)) {
            $files = array_merge($files, list_game_files($path, $rel));
        } elseif ($base === '' && in_array(strtolower($name), ignored_root_files(), true)) {
            continue;
        } else {
            $files[] = $rel;
        }
    }
    return $files;
}

// Hilfsprogramme (z. B. aus dem VGA/MIDI-Upgrade), die nie als Startdatei
// herhalten sollen.
function is_utility($name) {
    return preg_match('/^(avpatch\.exe|setm\.exe|setup\.bat|switch\.bat|.?midpak\.com)$/i', $name) === 1;
}

function detect_start_command($files) {
    $candidates = array(
        'run.bat', 'start.bat',
        'ultima.exe', 'ultima.com', 'ultima4.exe', 'u4.exe', 'u4.com',
        'avatar.exe', 'game.exe',
    );
    $root = array_values(array_filter($files, function ($f) {
        return strpos($f, '/') === false;
    }));
    foreach ($candidates as $candidate) {
        foreach ($root as $f) {
            if (strtolower($f) === $candidate) {
                return $f;
            }
        }
    }
    foreach ($root as $f) {
        if (preg_match('/\.(exe|com|bat)$/i', $f) && !is_utility($f)) {
            return $f;
        }
    }
    return null;
}

function autoexec_lines($files) {
    $custom = GAME_DIR . '/autoexec.txt';
    if (is_file($custom)) {
        return array_values(array_filter(preg_split('/\r?\n/', file_get_contents($custom))));
    }
    $lines = array('mount c .', 'c:');
    $start = detect_start_command($files);
    if ($start !== null) {
        $lines[] = strtoupper($start);
    } else {
        $lines[] = 'echo Keine Startdatei (.exe/.com/.bat) gefunden.';
        $lines[] = 'echo Lege eine game/autoexec.txt mit den Startbefehlen an.';
    }
    return $lines;
}

function dosbox_conf($files) {
    $lines = array_merge(
        array(
            '[sdl]', 'autolock=true', '',
            '[render]', 'aspect=true', '',
            '[cpu]', 'core=auto', 'cputype=auto', 'cycles=auto', '',
            '[autoexec]',
        ),
        autoexec_lines($files),
        array('')
    );
    return implode("\n", $lines);
}

/**
 * Baut das .jsdos-Bundle aus game/ und legt – falls vorhanden – die Dateien
 * aus dem Spielstand des Benutzers (changes-ZIP aus ci.persist()) darüber.
 */
function send_bundle($saveBlob) {
    $files = list_game_files();
    if (count($files) === 0) {
        fail('Der game/-Ordner ist leer. Bitte die originalen Ultima-IV-DOS-Dateien dorthin kopieren.', 409);
    }

    $overlay = array();
    if ($saveBlob !== null) {
        $saveTmp = tempnam(sys_get_temp_dir(), 'u4save');
        file_put_contents($saveTmp, $saveBlob);
        $saveZip = new ZipArchive();
        if ($saveZip->open($saveTmp) === true) {
            for ($i = 0; $i < $saveZip->numFiles; $i++) {
                $name = str_replace('\\', '/', $saveZip->getNameIndex($i));
                if (substr($name, -1) === '/') {
                    continue;
                }
                $overlay[$name] = $saveZip->getFromIndex($i);
            }
            $saveZip->close();
        }
        unlink($saveTmp);
    }

    $tmp = tempnam(sys_get_temp_dir(), 'u4bundle');
    $zip = new ZipArchive();
    $zip->open($tmp, ZipArchive::OVERWRITE);
    foreach ($files as $rel) {
        if (!isset($overlay[$rel])) {
            $zip->addFile(GAME_DIR . '/' . $rel, $rel);
        }
    }
    if (!isset($overlay['.jsdos/dosbox.conf'])) {
        $zip->addFromString('.jsdos/dosbox.conf', dosbox_conf($files));
    }
    foreach ($overlay as $name => $data) {
        $zip->addFromString($name, $data);
    }
    $zip->close();

    header('Content-Type: application/zip');
    header('Cache-Control: no-store');
    header('Content-Length: ' . filesize($tmp));
    readfile($tmp);
    unlink($tmp);
    exit;
}

// ------------------------------------------------------------------ Routing

session_set_cookie_params(array(
    'lifetime' => SESSION_MAX_AGE,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    // Hinter HTTPS zusätzlich: 'secure' => true
));
session_start();

$route = isset($_GET['r']) ? trim($_GET['r'], '/') : '';
$method = $_SERVER['REQUEST_METHOD'];

if ($route === 'register' && $method === 'POST') {
    $body = read_json_body();
    $username = isset($body['username']) ? $body['username'] : '';
    $password = isset($body['password']) ? $body['password'] : '';
    if (!is_string($username) || !preg_match('/^[A-Za-z0-9_.\-]{3,32}$/', $username)) {
        fail('Benutzername: 3–32 Zeichen, nur Buchstaben, Ziffern, _ . -', 400);
    }
    if (!is_string($password) || strlen($password) < 6) {
        fail('Passwort: mindestens 6 Zeichen.', 400);
    }
    try {
        $stmt = db()->prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
        $stmt->execute(array($username, password_hash($password, PASSWORD_DEFAULT)));
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'UNIQUE') !== false || strpos($e->getMessage(), 'constraint') !== false) {
            fail('Benutzername ist bereits vergeben.', 409);
        }
        throw $e;
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) db()->lastInsertId();
    json_out(array('username' => $username), 201);
}

if ($route === 'login' && $method === 'POST') {
    $body = read_json_body();
    $username = isset($body['username']) ? $body['username'] : '';
    $password = isset($body['password']) ? $body['password'] : '';
    $user = null;
    if (is_string($username) && $username !== '') {
        $stmt = db()->prepare('SELECT * FROM users WHERE username = ?');
        $stmt->execute(array($username));
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
    }
    if (!$user || !is_string($password) || !password_verify($password, $user['password_hash'])) {
        fail('Benutzername oder Passwort falsch.', 401);
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $user['id'];
    json_out(array('username' => $user['username']));
}

if ($route === 'logout' && $method === 'POST') {
    $_SESSION = array();
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    json_out(array('ok' => true));
}

if ($route === 'me' && $method === 'GET') {
    $user = require_auth();
    $stmt = db()->prepare('SELECT updated_at FROM saves WHERE user_id = ?');
    $stmt->execute(array($user['id']));
    $save = $stmt->fetch(PDO::FETCH_ASSOC);
    json_out(array(
        'username' => $user['username'],
        'gameFilesPresent' => count(list_game_files()) > 0,
        'saveUpdatedAt' => $save ? $save['updated_at'] : null,
    ));
}

if ($route === 'bundle' && $method === 'GET') {
    $user = require_auth();
    $stmt = db()->prepare('SELECT data FROM saves WHERE user_id = ?');
    $stmt->execute(array($user['id']));
    $save = $stmt->fetch(PDO::FETCH_ASSOC);
    send_bundle($save ? $save['data'] : null);
}

if ($route === 'save' && $method === 'PUT') {
    $user = require_auth();
    $blob = file_get_contents('php://input');
    if ($blob === false || strlen($blob) === 0) {
        fail('Leerer Spielstand.', 400);
    }
    if (strlen($blob) > MAX_SAVE_BYTES) {
        fail('Spielstand zu groß.', 413);
    }
    $updatedAt = gmdate('Y-m-d H:i:s');
    $stmt = db()->prepare(
        'INSERT INTO saves (user_id, data, updated_at) VALUES (:uid, :data, :ts)
         ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    );
    $stmt->bindValue(':uid', $user['id'], PDO::PARAM_INT);
    $stmt->bindValue(':data', $blob, PDO::PARAM_LOB);
    $stmt->bindValue(':ts', $updatedAt, PDO::PARAM_STR);
    $stmt->execute();
    json_out(array('ok' => true, 'updatedAt' => $updatedAt));
}

if ($route === 'save' && $method === 'GET') {
    $user = require_auth();
    $stmt = db()->prepare('SELECT data FROM saves WHERE user_id = ?');
    $stmt->execute(array($user['id']));
    $save = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$save) {
        fail('Kein Spielstand vorhanden.', 404);
    }
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="u4-spielstand-' . $user['username'] . '.zip"');
    echo $save['data'];
    exit;
}

if ($route === 'save' && $method === 'DELETE') {
    $user = require_auth();
    $stmt = db()->prepare('DELETE FROM saves WHERE user_id = ?');
    $stmt->execute(array($user['id']));
    json_out(array('ok' => true));
}

fail('Unbekannter API-Pfad.', 404);
