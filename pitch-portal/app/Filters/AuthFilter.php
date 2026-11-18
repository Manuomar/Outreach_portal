<?php

namespace App\Filters;

use App\Controllers\ApiController;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * AuthFilter - Protects backend API routes.
 * Ensures incoming requests have a valid Bearer token before reaching controllers.
 */
class AuthFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        // Allow CORS preflight requests
        if (strtoupper($request->getMethod()) === 'OPTIONS') {
            return;
        }

        $authHeader = $request->getHeaderLine('Authorization');
        $token = null;
        if (preg_match('/Bearer\s+(.+)/i', $authHeader, $matches)) {
            $token = trim($matches[1]);
        }

        if (!$token) {
            return service('response')
                ->setStatusCode(401)
                ->setJSON(['success' => false, 'error' => 'Authentication required (token missing)']);
        }

        $payload = ApiController::verifyToken($token);
        if (!$payload) {
            return service('response')
                ->setStatusCode(401)
                ->setJSON(['success' => false, 'error' => 'Invalid or expired session token']);
        }
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        // Nothing needed after
    }
}

