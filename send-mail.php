<?php
/**
 * Vela Digital - Direct Server SMTP Contact Form Handler
 *
 * Connects directly to the server's SMTP (Port 465 SSL). Falls back to PHP mail()
 * when no SMTP password is configured.
 *
 * Put the password in smtp_config.php (same folder), e.g.:
 *   <?php return ['password' => 'YOUR_SMTP_PASSWORD'];
 * and block web access to that file.
 */

// 1. CORS & Response Headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed. Only POST requests are accepted."]);
    exit();
}

// 2. SMTP Configuration (defaults; every key can be overridden in smtp_config.php)
$smtp_config = [
    'host'       => 'vela-dg.com',
    'port'       => 465,
    'username'   => 'support@vela-dg.com',
    'password'   => '',
    'from_email' => 'support@vela-dg.com',
    'from_name'  => 'Vela Digital Contact Form',
    'to_email'   => 'hello@vela-dg.com',
    'timeout'    => 15,
    'debug'      => true,  // TEMPORARY: shows the real error in the JSON response. Set to false once the form works.
    'verify_ssl' => true, // set false in smtp_config.php only if the certificate does not match 'host'
];

if (file_exists(__DIR__ . '/smtp_config.php')) {
    $custom_config = include __DIR__ . '/smtp_config.php';
    if (is_array($custom_config)) {
        $smtp_config = array_merge($smtp_config, $custom_config);
    }
}

// 3. Parse Input Data (JSON or form-encoded)
$raw_input = file_get_contents('php://input');
$data = [];

if (!empty($raw_input)) {
    $json = json_decode($raw_input, true);
    if (is_array($json)) {
        $data = $json;
    }
}

if (empty($data)) {
    $data = $_POST;
}

// Helpers
function clean_line($value) {
    // Single-line text: strip tags and any CR/LF (prevents header injection)
    return trim(preg_replace('/[\r\n]+/', ' ', strip_tags((string)$value)));
}

function h($value) {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

// 4. Spam Honeypot
$honeypot = isset($data['website_url_hp']) ? trim((string)$data['website_url_hp']) : '';
if ($honeypot !== '') {
    echo json_encode(["success" => true, "message" => "Message sent successfully."]);
    exit();
}

// 5. Extract & Sanitize Fields
$name     = isset($data['name'])     ? clean_line($data['name'])    : '';
$company  = isset($data['company'])  ? clean_line($data['company']) : '';
$email    = isset($data['email'])    ? trim(preg_replace('/[\r\n]+/', '', filter_var((string)$data['email'], FILTER_SANITIZE_EMAIL))) : '';
$phone    = (isset($data['phone']) && clean_line($data['phone']) !== '') ? clean_line($data['phone']) : 'Not provided';
$interest = (isset($data['interest']) && clean_line($data['interest']) !== '') ? clean_line($data['interest']) : 'General Inquiry';

$message_raw = isset($data['message']) ? trim((string)$data['message']) : '';
$message_html = h($message_raw);

$subject_raw = isset($data['subject']) ? clean_line($data['subject']) : '';

// 6. Validation
if ($name === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Full name is required."]);
    exit();
}

if ($company === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Company name is required."]);
    exit();
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "A valid work email address is required."]);
    exit();
}

if ($message_raw === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Message is required."]);
    exit();
}

// 7. Compose Email Content
$subject_label = $subject_raw !== '' ? $subject_raw : "Contact Form: $interest - $name";
$email_subject = "=?UTF-8?B?" . base64_encode($subject_label) . "?=";

$html_body = "<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #172846; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; }
    .header { font-size: 20px; font-weight: 700; color: #0b1528; border-bottom: 2px solid #0b1528; padding-bottom: 12px; margin-bottom: 20px; }
    .field { margin-bottom: 12px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; font-weight: 600; }
    .value { font-size: 15px; color: #0f172a; margin-top: 2px; }
    .message-box { margin-top: 20px; padding: 16px; background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; font-size: 14px; }
    .footer { margin-top: 24px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 12px; }
  </style>
</head>
<body>
  <div class='container'>
    <div class='header'>New Website Inquiry - Vela Digital</div>
    <div class='field'><div class='label'>Full Name</div><div class='value'>" . h($name) . "</div></div>
    <div class='field'><div class='label'>Company</div><div class='value'>" . h($company) . "</div></div>
    <div class='field'><div class='label'>Work Email</div><div class='value'><a href='mailto:" . h($email) . "'>" . h($email) . "</a></div></div>
    <div class='field'><div class='label'>Phone</div><div class='value'>" . h($phone) . "</div></div>
    <div class='field'><div class='label'>Area of Interest</div><div class='value'>" . h($interest) . "</div></div>
    <div class='field'>
      <div class='label'>Message</div>
      <div class='message-box'>" . nl2br($message_html) . "</div>
    </div>
    <div class='footer'>Sent directly via Vela Digital website contact form.</div>
  </div>
</body>
</html>";

$plain_body = "New Website Inquiry - Vela Digital\n\n"
    . "Full Name: $name\n"
    . "Company: $company\n"
    . "Work Email: $email\n"
    . "Phone: $phone\n"
    . "Area of Interest: $interest\n\n"
    . "Message:\n$message_raw\n";

// 8. Send Email
function send_smtp_mail($config, $to, $subject, $html_content, $plain_content, $reply_to, $reply_to_name) {
    $host       = $config['host']       ?? 'localhost';
    $port       = (int)($config['port'] ?? 465);
    $timeout    = (int)($config['timeout'] ?? 15);
    $username   = $config['username']   ?? '';
    $password   = $config['password']   ?? '';
    $from_email = $config['from_email'] ?? $username;
    $from_name  = $config['from_name']  ?? 'Contact Form';
    $verify     = !empty($config['verify_ssl']);

    $encoded_from_name  = "=?UTF-8?B?" . base64_encode($from_name) . "?=";
    $encoded_reply_name = "=?UTF-8?B?" . base64_encode($reply_to_name) . "?=";

    // No SMTP password configured -> fall back to PHP mail()
    if ($password === '') {
        $boundary = md5(uniqid((string)time(), true));
        $headers  = "From: $encoded_from_name <$from_email>\r\n";
        $headers .= "Reply-To: $encoded_reply_name <$reply_to>\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";

        $body  = "--$boundary\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($plain_content)) . "\r\n";
        $body .= "--$boundary\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($html_content)) . "\r\n";
        $body .= "--$boundary--";

        if (@mail($to, $subject, $body, $headers)) {
            return ["success" => true];
        }
        return ["success" => false, "error" => "SMTP password not configured and PHP mail() also failed."];
    }

    $context = stream_context_create([
        'ssl' => [
            'verify_peer'       => $verify,
            'verify_peer_name'  => $verify,
            'allow_self_signed' => !$verify,
        ]
    ]);

    $errno  = 0;
    $errstr = '';
    $socket = @stream_socket_client(
        "ssl://{$host}:{$port}",
        $errno,
        $errstr,
        $timeout,
        STREAM_CLIENT_CONNECT,
        $context
    );

    if (!$socket) {
        return ["success" => false, "error" => "Could not connect to SMTP server: $errstr ($errno)"];
    }

    stream_set_timeout($socket, $timeout);

    $read_response = function () use ($socket) {
        $response = '';
        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return $response;
    };

    $send_cmd = function ($cmd) use ($socket, $read_response) {
        fwrite($socket, $cmd . "\r\n");
        return $read_response();
    };

    $fail = function ($msg) use ($socket) {
        @fwrite($socket, "QUIT\r\n");
        @fclose($socket);
        return ["success" => false, "error" => $msg];
    };

    $greeting = $read_response();
    if (substr($greeting, 0, 3) !== '220') {
        return $fail("Invalid SMTP greeting: $greeting");
    }

    $ehlo_host = gethostname() ?: 'localhost';
    $ehlo = $send_cmd("EHLO $ehlo_host");
    if (substr($ehlo, 0, 3) !== '250') {
        return $fail("EHLO failed: $ehlo");
    }

    $auth = $send_cmd("AUTH LOGIN");
    if (substr($auth, 0, 3) !== '334') {
        return $fail("AUTH LOGIN failed: $auth");
    }

    $user_resp = $send_cmd(base64_encode($username));
    if (substr($user_resp, 0, 3) !== '334') {
        return $fail("SMTP Username rejected: $user_resp");
    }

    $pass_resp = $send_cmd(base64_encode($password));
    if (substr($pass_resp, 0, 3) !== '235') {
        return $fail("SMTP Authentication failed: $pass_resp");
    }

    $mail_from = $send_cmd("MAIL FROM:<$from_email>");
    if (substr($mail_from, 0, 3) !== '250') {
        return $fail("MAIL FROM failed: $mail_from");
    }

    $rcpt_to = $send_cmd("RCPT TO:<$to>");
    if (substr($rcpt_to, 0, 3) !== '250' && substr($rcpt_to, 0, 3) !== '251') {
        return $fail("RCPT TO failed: $rcpt_to");
    }

    $data_resp = $send_cmd("DATA");
    if (substr($data_resp, 0, 3) !== '354') {
        return $fail("DATA command failed: $data_resp");
    }

    $boundary = "----=_NextPart_" . md5(uniqid((string)microtime(true), true));

    $message_headers = [
        "From: $encoded_from_name <$from_email>",
        "To: <$to>",
        "Reply-To: $encoded_reply_name <$reply_to>",
        "Subject: $subject",
        "Date: " . date("r"),
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"$boundary\"",
        "X-Mailer: VelaDigital-DirectSMTP/1.0",
    ];

    $email_payload  = implode("\r\n", $message_headers) . "\r\n\r\n";
    $email_payload .= "--$boundary\r\n";
    $email_payload .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $email_payload .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $email_payload .= chunk_split(base64_encode($plain_content)) . "\r\n";
    $email_payload .= "--$boundary\r\n";
    $email_payload .= "Content-Type: text/html; charset=UTF-8\r\n";
    $email_payload .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $email_payload .= chunk_split(base64_encode($html_content)) . "\r\n";
    $email_payload .= "--$boundary--\r\n";

    // Body is base64, so no line can start with "." (no dot-stuffing needed).
    fwrite($socket, $email_payload);
    $final_resp = $send_cmd(".");

    $send_cmd("QUIT");
    fclose($socket);

    if (substr($final_resp, 0, 3) === '250') {
        return ["success" => true];
    }

    return ["success" => false, "error" => "Delivery failed: $final_resp"];
}

$result = send_smtp_mail(
    $smtp_config,
    $smtp_config['to_email'],
    $email_subject,
    $html_body,
    $plain_body,
    $email,
    $name
);

if (!empty($result['success'])) {
    echo json_encode(["success" => true, "message" => "Your message has been sent successfully."]);
} else {
    http_response_code(500);
    error_log("[Vela Contact Form Error] " . ($result['error'] ?? 'Unknown error'));
    $response = ["success" => false, "message" => "Unable to send your message right now. Please try again later."];
    if (!empty($smtp_config['debug'])) {
        $response['debug'] = $result['error'] ?? 'Unknown error';
    }
    echo json_encode($response);
}
