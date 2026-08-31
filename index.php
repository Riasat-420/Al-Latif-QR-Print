<?php
/**
 * Hostinger PHP Reverse Proxy for Node.js Backend (Port 3000)
 */

$nodePort = 3000;
$requestUri = $_SERVER['REQUEST_URI'];
$method = $_SERVER['REQUEST_METHOD'];

$targetUrl = "http://127.0.0.1:{$nodePort}" . $requestUri;

$ch = curl_init($targetUrl);

// Forward headers
$headers = [];
foreach (getallheaders() as $key => $value) {
    if (strtolower($key) !== 'host') {
        $headers[] = "{$key}: {$value}";
    }
}
$headers[] = "Host: " . $_SERVER['HTTP_HOST'];
$headers[] = "X-Forwarded-For: " . $_SERVER['REMOTE_ADDR'];
$headers[] = "X-Forwarded-Proto: " . (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http');

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
    $input = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
}

$response = curl_exec($ch);

if ($response === false) {
    http_response_code(502);
    echo "<h1>502 Bad Gateway</h1><p>Node.js backend is offline or starting up.</p>";
    exit;
}

$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$headerText = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);

http_response_code($httpCode);

// Forward response headers
foreach (explode("\r\n", $headerText) as $i => $line) {
    if ($i === 0 || empty($line)) continue;
    if (stripos($line, 'Transfer-Encoding:') !== false) continue;
    header($line, false);
}

echo $body;
