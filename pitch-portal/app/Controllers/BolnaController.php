<?php

namespace App\Controllers;

class BolnaController extends ApiController
{
    public function ping()
    {
        return $this->respond(['ok' => true, 'msg' => 'Bolna webhook endpoint is active (expects POST requests)']);
    }

    public function webhook()
    {
        $secret = (string) env('pipeline.webhookSecret', '');
        if ($secret !== '' && ! hash_equals($secret, $this->request->getHeaderLine('X-Webhook-Secret'))) {
            return $this->respond(['ok' => false, 'error' => 'bad secret'], 403);
        }
        $raw = $this->request->getBody();
        if (! is_array(json_decode($raw, true))) {
            return $this->respond(['ok' => false, 'error' => 'invalid json'], 400);
        }
        $dir = WRITEPATH . 'bolna_payloads';
        if (! is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $file = $dir . DIRECTORY_SEPARATOR . 'p_' . uniqid() . '.json';
        file_put_contents($file, $raw);
        // Gemini reasoning takes a few seconds -> execute in background
        $this->runPipelineBackground('process_webhook.py', [$file]);
        return $this->respond(['ok' => true, 'queued' => true]);
    }
}
