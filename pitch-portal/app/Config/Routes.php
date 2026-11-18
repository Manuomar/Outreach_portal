<?php

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */
$routes->get('/', static fn () => json_encode(['service' => 'Outreach Portal API', 'ok' => true]));

$routes->options('api/(:any)', 'ApiController::options');

$routes->group('api', static function ($routes) {
    // Public routes (no auth required)
    $routes->post('auth/login', 'AuthController::login');
    $routes->post('auth/refresh', 'AuthController::refresh');
    $routes->post('auth/logout', 'AuthController::logout');
    $routes->post('bolna/webhook', 'BolnaController::webhook');
    $routes->get('bolna/webhook', 'BolnaController::ping');

    // Protected routes (strictly guarded by AuthFilter)
    $routes->group('', ['filter' => 'auth'], static function ($routes) {
        // Authenticated user profile
        $routes->get('auth/me', 'AuthController::me');

        // Users management (Admin / team users)
        $routes->get('users', 'UsersController::index');
        $routes->post('users', 'UsersController::create');
        $routes->get('users/(:num)', 'UsersController::show/$1');
        $routes->put('users/(:num)', 'UsersController::update/$1');
        $routes->delete('users/(:num)', 'UsersController::delete/$1');

        // Leads & numbers
        $routes->get('leads', 'LeadsController::index');
        $routes->post('leads', 'LeadsController::create');
        $routes->post('leads/bulk', 'LeadsController::bulk');
        $routes->put('leads/(:num)', 'LeadsController::update/$1');
        $routes->post('leads/(:num)/disable', 'LeadsController::disable/$1');
        $routes->post('leads/(:num)/enable', 'LeadsController::enable/$1');
        $routes->delete('leads/(:num)', 'LeadsController::delete/$1');

        // Calls
        $routes->get('calls', 'CallsController::index');
        $routes->post('calls/start', 'CallsController::start');
        $routes->get('calls/(:num)', 'CallsController::show/$1');
        $routes->post('calls/(:num)/sync', 'CallsController::sync/$1');
        $routes->post('calls/(:num)/hangup', 'CallsController::hangup/$1');
        $routes->put('calls/(:num)', 'CallsController::update/$1');

        // AI Agents Management
        $routes->get('agents', 'AgentsController::index');
        $routes->post('agents', 'AgentsController::create');
        $routes->get('agents/(:num)', 'AgentsController::show/$1');
        $routes->put('agents/(:num)', 'AgentsController::update/$1');
        $routes->post('agents/(:num)/default', 'AgentsController::setDefault/$1');
        $routes->post('agents/(:num)/sync-extractions', 'AgentsController::syncExtractions/$1');
        $routes->post('agents/(:num)/enable', 'AgentsController::enable/$1');
        $routes->post('agents/(:num)/permanent-delete', 'AgentsController::permanentDelete/$1');
        $routes->get('agents/inactive', 'AgentsController::inactive');
        $routes->delete('agents/(:num)', 'AgentsController::delete/$1');

        // Bolna Knowledge Base API
        $routes->post('agents/import', 'AgentsController::importFromBolna');
$routes->get('knowledgebase', 'AgentsController::listKnowledgebases');
        $routes->post('knowledgebase/upload', 'AgentsController::uploadKnowledgebase');

        // Bolna Accounts (multi-account API key manager)
        $routes->get('bolna-accounts', 'BolnaAccountsController::index');
        $routes->post('bolna-accounts', 'BolnaAccountsController::create');
        $routes->put('bolna-accounts/(:num)', 'BolnaAccountsController::update/$1');
        $routes->post('bolna-accounts/(:num)/default', 'BolnaAccountsController::setDefault/$1');
        $routes->delete('bolna-accounts/(:num)', 'BolnaAccountsController::delete/$1');
        $routes->post('bolna-accounts/test-connection', 'BolnaAccountsController::testConnection');

        // Agent Templates (prompt/KB templates stored in DB)
        $routes->get('agent-templates', 'AgentTemplatesController::index');
        $routes->get('agent-templates/(:segment)', 'AgentTemplatesController::show/$1');
        $routes->post('agent-templates', 'AgentTemplatesController::create');
        $routes->put('agent-templates/(:num)', 'AgentTemplatesController::update/$1');

        // Extraction Fields (global default field definitions stored in DB)
        $routes->get('extraction-fields', 'AgentTemplatesController::listFields');
        $routes->post('extraction-fields', 'AgentTemplatesController::createField');
        $routes->put('extraction-fields/(:num)', 'AgentTemplatesController::updateField/$1');
        $routes->delete('extraction-fields/(:num)', 'AgentTemplatesController::deleteField/$1');

        // AI Prompt Generator (Gemini)
        $routes->post('generate-prompt', 'GeneratePromptController::generate');
        $routes->options('generate-prompt', 'GeneratePromptController::options');
        $routes->get('gemini-keys', 'GeneratePromptController::listKeys');
        $routes->post('gemini-keys', 'GeneratePromptController::addKey');
        $routes->delete('gemini-keys', 'GeneratePromptController::deleteKey');
        $routes->options('gemini-keys', 'GeneratePromptController::options');
        $routes->post('gemini-models', 'GeneratePromptController::updateModels');
        $routes->get('gemini-available-models', 'GeneratePromptController::listAvailableModels');
        $routes->options('gemini-models', 'GeneratePromptController::options');

        // Portal Settings (general key-value store)
        $routes->get('settings', 'SettingsController::index');
        $routes->post('settings', 'SettingsController::save');
        $routes->delete('settings/(:segment)', 'SettingsController::remove/$1');

        // Dashboard & Analytics
        $routes->get('stats', 'StatsController::index');
        $routes->get('meetings', 'StatsController::meetings');
    });
});
