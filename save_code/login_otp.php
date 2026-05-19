<?php
// ================= Cấu hình =================
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

// ===== CORS =====
header("Access-Control-Allow-Origin: *"); // thay domain front-end nếu khác
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// Preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ===== File cookie =====
$cookieFile = __DIR__ . '/misa_cookies.txt';

// ===== Hàm gửi request với cookie =====
function sendRequest($url, $method = 'GET', $body = null, $cookies = []) {
    $ch = curl_init($url);
    
    $headers = ['Content-Type: application/json'];
    
    if (!empty($cookies)) {
        $cookieStr = '';
        foreach ($cookies as $k => $v) $cookieStr .= "$k=$v; ";
        $headers[] = "Cookie: $cookieStr";
    }
    
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 30
    ]);
    
    if ($body) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    
    $response = curl_exec($ch);
    if ($response === false) {
        return ['body' => json_encode(['error' => curl_error($ch)]), 'cookies' => $cookies];
    }
    
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $header = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    curl_close($ch);

    // parse Set-Cookie chuẩn để lưu device cookie
    preg_match_all('/Set-Cookie:\s*([^=]+)=([^;]+);/i', $header, $matches, PREG_SET_ORDER);
    foreach ($matches as $m) {
        $cookies[$m[1]] = $m[2];
    }

    return ['body' => $body ?: '{}', 'cookies' => $cookies];
}

// ===== Main =====
$step = $_GET['step'] ?? '';

try {
    if ($step === 'login') {
        $username = $_POST['Username'] ?? null;
        $password = $_POST['Password'] ?? null;
        if (!$username || !$password) throw new Exception('Thiếu Username hoặc Password');

        $loginUrl = 'https://amisapp.misa.vn/APIS/AuthenAPI/api/Account/login';
        $res = sendRequest($loginUrl, 'POST', [
            'Username' => $username,
            'Password' => $password
        ]);

        file_put_contents($cookieFile, json_encode($res['cookies']));
        echo $res['body'];
        exit;
    }

    if ($step === 'otp') {
        $otp = $_POST['OTP'] ?? null;
        $token = $_POST['Token'] ?? null;
        if (!$otp || !$token) throw new Exception('Thiếu OTP hoặc Token');

        $cookies = json_decode(file_get_contents($cookieFile), true) ?? [];

        $otpUrl = 'https://amisapp.misa.vn/APIS/AuthenAPI/api/Account/loginwithotp';
        $res = sendRequest($otpUrl, 'POST', [
            'OTP' => $otp,
            'UseAppAuthenticator' => true,
            'Remember' => true,
            'Token' => $token
        ], $cookies);

        file_put_contents($cookieFile, json_encode($res['cookies']));
        echo $res['body'];
        exit;
    }

 if ($step === 'crm') {
    // Load cookie đã lưu (bao gồm DeviceId)
    $cookies = json_decode(file_get_contents($cookieFile), true) ?? [];

    $crmUrl = 'https://amisapp.misa.vn/crm/g1/api/auth/auth';
    $res = sendRequest($crmUrl, 'POST', null, $cookies);

    $body = json_decode($res['body'], true);

    // ⚠️ Nếu SID không hợp lệ thì xóa file cookie
    if (isset($body['ErrorMessage']) && stripos($body['ErrorMessage'], 'SID không hợp lệ') !== false) {
        if (file_exists($cookieFile)) unlink($cookieFile);
    }

    echo $res['body'];
    exit;
}

    throw new Exception('Step không hợp lệ');

} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}