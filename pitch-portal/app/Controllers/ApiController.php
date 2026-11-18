<?php

namespace App\Controllers;

use CodeIgniter\API\ResponseTrait;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use Psr\Log\LoggerInterface;

/**
 * Sab API controllers ka base: CORS, token guard, python pipeline runner.
 */
class ApiController extends BaseController
{
    use ResponseTrait;

    public function initController(RequestInterface $request, ResponseInterface $response, LoggerInterface $logger)
    {
        parent::initController($request, $response, $logger);
        $origin = env('portal.corsOrigin', '*');
        $this->response
            ->setHeader('Access-Control-Allow-Origin', $origin)
            ->setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret')
            ->setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }

    public function options()
    {
        return $this->response->setStatusCode(204);
    }

    protected ?array $currentUser = null;

    // ---------- auth token (HMAC signed, 7 days) ----------
    public static function makeToken(string $user, array $extra = []): string
    {
        $payload = array_merge(['u' => $user, 'exp' => time() + 604800], $extra);
        $p = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
        return $p . '.' . hash_hmac('sha256', $p, (string) env('portal.tokenSecret', 'change-me'));
    }

    public static function verifyToken(string $token): ?array
    {
        if (!str_contains($token, '.')) {
            return null;
        }
        [$p, $sig] = explode('.', trim($token), 2);
        if (!hash_equals(hash_hmac('sha256', $p, (string) env('portal.tokenSecret', 'change-me')), $sig)) {
            return null;
        }
        $data = json_decode(base64_decode(strtr($p, '-_', '+/')), true);
        if (!$data || ($data['exp'] ?? 0) <= time()) {
            return null;
        }
        return $data;
    }

    protected function guard(): void
    {
        $h = $this->request->getHeaderLine('Authorization');
        $token = null;
        if (preg_match('/Bearer\s+(.+)/i', $h, $m)) {
            $token = trim($m[1]);
        }

        $payload = $token ? self::verifyToken($token) : null;
        if (!$payload) {
            $this->response->setStatusCode(401)->setJSON(['success' => false, 'error' => 'Unauthorized or expired session'])->send();
            exit;
        }

        // Fetch fresh user record if user ID is in token, else use payload
        $uid = $payload['uid'] ?? null;
        if ($uid) {
            $u = $this->db()->table('pitch_users')->where('id', (int) $uid)->where('status', 'active')->get()->getRowArray();
            if ($u) {
                unset($u['password_hash']);
                $this->currentUser = $u;
            }
        }

        if (!$this->currentUser) {
            $this->currentUser = [
                'id' => $payload['uid'] ?? 1,
                'username' => $payload['u'] ?? 'admin',
                'name' => $payload['name'] ?? 'Admin Organizer',
                'role' => $payload['role'] ?? 'admin',
            ];
        }
    }

    protected function requireRole(string ...$roles): void
    {
        $this->guard();
        $userRole = strtolower((string) ($this->currentUser['role'] ?? ''));
        $allowed = array_map('strtolower', $roles);
        if (!in_array($userRole, $allowed, true)) {
            $this->response->setStatusCode(403)->setJSON(['success' => false, 'error' => 'Permission denied for this action'])->send();
            exit;
        }
    }

    protected function audit(string $action, ?string $entityType = null, $entityId = null, $details = null): void
    {
        \App\Libraries\AuditLogger::log(
            $action,
            $entityType,
            $entityId,
            $details,
            isset($this->currentUser['id']) ? (int) $this->currentUser['id'] : null,
            $this->currentUser['username'] ?? null
        );
    }

    protected function body(): array
    {
        $j = $this->request->getJSON(true);
        return is_array($j) ? $j : (array) $this->request->getPost();
    }

    protected function db()
    {
        return \Config\Database::connect();
    }

    protected function pipelineDir(): string
    {
        return rtrim(ROOTPATH, '/\\') . DIRECTORY_SEPARATOR . 'ai_pipeline';
    }

    protected function getPythonPath(): string
    {
        $py = trim((string) env('pipeline.python', ''), " '\"\t\n\r\0\x0B");
        if ($py !== '' && file_exists($py)) {
            return $py;
        }
        $venvPy = $this->pipelineDir() . DIRECTORY_SEPARATOR . 'venv' . DIRECTORY_SEPARATOR . 'Scripts' . DIRECTORY_SEPARATOR . 'python.exe';
        if (file_exists($venvPy)) {
            return $venvPy;
        }
        return 'python';
    }

    /** Execute python script synchronously and return the last JSON line */
    protected function runPipeline(string $script, array $args): array
    {
        putenv('PYTHONUTF8=1');
        putenv('PYTHONIOENCODING=utf-8');

        $py = $this->getPythonPath();
        $cmd = escapeshellarg($py) . ' ' . escapeshellarg($this->pipelineDir() . DIRECTORY_SEPARATOR . $script);
        foreach ($args as $a) {
            $cmd .= ' ' . escapeshellarg((string) $a);
        }
        $out = shell_exec($cmd . ' 2>&1') ?? '';
        $lines = array_values(array_filter(array_map('trim', explode("\n", $out))));
        for ($i = count($lines) - 1; $i >= 0; $i--) {
            $j = json_decode($lines[$i], true);
            if (is_array($j)) {
                return $j;
            }
        }
        return ['success' => false, 'error' => 'Unable to parse Python output: ' . mb_substr($out, 0, 400)];
    }

    /** Execute script in background (to respond 200 quickly to webhooks) */
    protected function runPipelineBackground(string $script, array $args): void
    {
        putenv('PYTHONUTF8=1');
        putenv('PYTHONIOENCODING=utf-8');

        $py = $this->getPythonPath();
        $cmd = escapeshellarg($py) . ' ' . escapeshellarg($this->pipelineDir() . DIRECTORY_SEPARATOR . $script);
        foreach ($args as $a) {
            $cmd .= ' ' . escapeshellarg((string) $a);
        }
        if (stripos(PHP_OS, 'WIN') === 0) {
            pclose(popen('start /B "" ' . $cmd . ' > NUL 2>&1', 'r'));
        } else {
            exec($cmd . ' > /dev/null 2>&1 &');
        }
    }
}
