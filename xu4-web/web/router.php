<?php
$p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (strpos($p, '/api/') !== false) { require __DIR__ . '/api.php'; return true; }
return false;
