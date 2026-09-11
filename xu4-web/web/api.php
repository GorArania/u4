<?php
/**
 * xu4-web – PHP-Backend: Anmeldung + Spielstand-Speicherung pro Benutzer.
 *
 * Statisches Spiel (WASM) + diese API laufen unter Apache/PHP. Jeder Benutzer
 * meldet sich an (Login/Passwort); sein Spielstand (ein ZIP der xu4-Save-
 * Dateien, z. B. PARTY.SAV) wird serverseitig in SQLite abgelegt, sodass
 * mehrere Leute ihr Spiel geräteübergreifend fortsetzen können.
 *
 * Benötigt: PHP >= 7.4 mit pdo_sqlite (php-sqlite3).
 * URLs api/register, api/login, ... werden per .htaccess hierher umgeschrieben.
 */

define('DATA_DIR', __DIR__ . '/data');
define('MAX_SAVE_BYTES', 8 * 1024 * 1024);
define('SESSION_MAX_AGE', 30 * 24 * 60 * 60);

function json_out($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}
function fail($message, $status) { json_out(array('error' => $message), $status); }
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
        $pdo = new PDO('sqlite:' . DATA_DIR . '/xu4web.sqlite');
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
        $pdo->exec("CREATE TABLE IF NOT EXISTS user_maps (
            user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            worldmap   BLOB NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )");
    }
    return $pdo;
}

function current_user() {
    if (empty($_SESSION['uid'])) return null;
    $stmt = db()->prepare('SELECT id, username FROM users WHERE id = ?');
    $stmt->execute(array($_SESSION['uid']));
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user ?: null;
}
function require_auth() {
    $user = current_user();
    if (!$user) fail('Nicht angemeldet.', 401);
    return $user;
}

// ------------------------------------------------------------------ Routing

session_set_cookie_params(array(
    'lifetime' => SESSION_MAX_AGE,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
));
session_start();

$route = isset($_GET['r']) ? trim($_GET['r'], '/') : '';
if ($route === '') {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (is_string($path) && preg_match('#/api/([a-z]+)/?$#', $path, $m)) {
        $route = $m[1];
    }
}
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
    $user = current_user();
    if (!$user) json_out(array('user' => null));
    $stmt = db()->prepare('SELECT updated_at FROM saves WHERE user_id = ?');
    $stmt->execute(array($user['id']));
    $save = $stmt->fetch(PDO::FETCH_ASSOC);
    json_out(array(
        'user' => $user['username'],
        'saveUpdatedAt' => $save ? $save['updated_at'] : null,
    ));
}

// Spielstand-Blob (ZIP der xu4-Save-Dateien) hoch-/runterladen.
if ($route === 'save' && $method === 'PUT') {
    $user = require_auth();
    $blob = file_get_contents('php://input');
    if ($blob === false || strlen($blob) === 0) fail('Leerer Spielstand.', 400);
    if (strlen($blob) > MAX_SAVE_BYTES) fail('Spielstand zu groß.', 413);
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
    if (!$save) { http_response_code(204); exit; } // 204 = kein Spielstand
    header('Content-Type: application/zip');
    header('Cache-Control: no-store');
    echo $save['data'];
    exit;
}

if ($route === 'save' && $method === 'DELETE') {
    $user = require_auth();
    db()->prepare('DELETE FROM saves WHERE user_id = ?')->execute(array($user['id']));
    json_out(array('ok' => true));
}

// ----------------------------------------- Persoenliche Map des Benutzers
define('U4DATA', __DIR__ . '/u4.data');
define('U4JS',   __DIR__ . '/u4.js');

/**
 * Liest Start und Ende einer eingebetteten Datei aus den Paket-Metadaten in
 * u4.js. Emscriptens file_packager schreibt dort fuer jede der Dateien in
 * u4.data ein {filename:"...",start:N,end:M}.
 *
 * Der Offset stand hier frueher fest verdrahtet. Das geht still kaputt,
 * sobald die Engine neu gebaut wird und sich im Paket eine Datei davor in der
 * Groesse aendert -- api/map liefert dann 64 KB Muell als Weltkarte, und zwar
 * nur an Benutzer ohne eigenen Eintrag in user_maps. Jetzt kommt die Wahrheit
 * aus derselben Quelle, die auch der Browser benutzt.
 */
function u4data_extent($packagePath) {
    static $cache = null;
    if ($cache === null) {
        $cache = array();
        $js = @file_get_contents(U4JS);
        if ($js !== false && preg_match_all(
                '/\{filename:"([^"]+)",start:(\d+),end:(\d+)\}/', $js, $m, PREG_SET_ORDER)) {
            foreach ($m as $f) $cache[$f[1]] = array((int) $f[2], (int) $f[3]);
        }
    }
    return isset($cache[$packagePath]) ? $cache[$packagePath] : null;
}

/**
 * Originale Weltkarte aus u4.data. Gibt false zurueck, wenn die Datei fehlt
 * oder nicht 65536 Bytes gross ist -- falsche Bytes waeren schlimmer als ein
 * Fehler, denn das Spiel schreibt sie ungeprueft als WORLD.MAP.
 */
function u4data_read_worldmap() {
    $ext = u4data_extent('/ultima4/WORLD.MAP');
    if ($ext === null) return false;
    list($start, $end) = $ext;
    if ($end - $start !== 65536) return false;
    $fh = fopen(U4DATA, 'rb');
    if (!$fh) return false;
    fseek($fh, $start);
    $data = fread($fh, 65536);
    fclose($fh);
    return (strlen($data) === 65536) ? $data : false;
}

// GET api/map – liefert die persoenliche Map des Benutzers (oder Original)
if ($route === 'map' && $method === 'GET') {
    $user = require_auth();
    $stmt = db()->prepare('SELECT worldmap FROM user_maps WHERE user_id = ?');
    $stmt->execute(array($user['id']));
    $row  = $stmt->fetch(PDO::FETCH_ASSOC);
    $data = $row ? $row['worldmap'] : u4data_read_worldmap();
    if ($data === false) { http_response_code(500); exit; }
    header('Content-Type: application/octet-stream');
    header('Cache-Control: no-store');
    header('Content-Length: ' . strlen($data));
    echo $data;
    exit;
}

fail('Unbekannter API-Pfad.', 404);
