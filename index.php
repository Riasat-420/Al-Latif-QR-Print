<?php
/**
 * Hostinger PHP Reverse Proxy for Node.js Backend (Port 3000)
 * Supports all HTTP methods, JSON, URL-encoded, and Multipart file uploads.
 */

// Disable execution time limit for uploads
set_time_limit(120);

$nodePort = 3000;
$requestUri = $_SERVER['REQUEST_URI'];
$method = $_SERVER['REQUEST_METHOD'];

$targetUrl = "http://127.0.0.1:{$nodePort}" . $requestUri;

$ch = curl_init($targetUrl);

$contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
$isMultipart = !empty($_FILES) || stripos($contentType, 'multipart/form-data') !== false;

// Prepare headers
$headers = [];
foreach (getallheaders() as $key => $value) {
    $lowerKey = strtolower($key);
    // Don't forward host or custom content-type for multipart (cURL sets boundary automatically)
    if ($lowerKey === 'host' || ($isMultipart && $lowerKey === 'content-type') || $lowerKey === 'content-length') {
        continue;
    }
    $headers[] = "{$key}: {$value}";
}
$headers[] = "Host: " . ($_SERVER['HTTP_HOST'] ?? 'localhost');
$headers[] = "X-Forwarded-For: " . ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
$headers[] = "X-Forwarded-Proto: " . (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http');

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);

// Handle POST payload
if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
    if ($isMultipart) {
        $postData = $_POST;
        foreach ($_FILES as $name => $file) {
            if (!empty($file['tmp_name']) && file_exists($file['tmp_name'])) {
                $postData[$name] = new CURLFile($file['tmp_name'], $file['type'], $file['name']);
            }
        }
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    } else {
        $rawInput = file_get_contents('php://input');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $rawInput);
    }
}

$response = curl_exec($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Node.js backend is offline or starting up. (cURL error: ' . curl_error($ch) . ')']);
    curl_close($ch);
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
