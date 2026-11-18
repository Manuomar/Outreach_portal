-- ITI CCIMS Outreach Portal — MySQL / MariaDB schema
CREATE DATABASE IF NOT EXISTS pitch_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pitch_portal;

CREATE TABLE IF NOT EXISTS pitch_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(150) NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  role ENUM('admin','organizer','agent','viewer') NOT NULL DEFAULT 'agent',
  status ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_role (role),
  KEY idx_status (status)
) ENGINE=InnoDB;

-- Default Admin User (username: admin, password: Admin@123)
INSERT INTO pitch_users (username, email, password_hash, name, role, status)
VALUES ('admin', 'admin@iti-ccims.gov.in', '$2y$10$meQiTkNEZRwkD64chPEYYuTmr/fjtkfDkx0xno12hlthfvJOQtwom', 'Admin Organizer', 'admin', 'active')
ON DUPLICATE KEY UPDATE username=username;

CREATE TABLE IF NOT EXISTS pitch_leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_name VARCHAR(150) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  organization VARCHAR(200) NULL,
  designation VARCHAR(120) NULL,
  sector VARCHAR(80) NULL,
  state VARCHAR(80) NULL,
  district VARCHAR(80) NULL,
  notes TEXT NULL,
  lead_status ENUM('new','contacted','interested','not_interested','callback','meeting_scheduled') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_phone (phone),
  KEY idx_status (lead_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pitch_calls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  bolna_execution_id VARCHAR(100) NULL,
  call_status ENUM('queued','ringing','in_progress','completed','busy','no_answer','failed') NOT NULL DEFAULT 'queued',
  interest_status ENUM('interested','maybe','callback_requested','not_interested','not_reachable','unknown') NULL,
  interest_reason VARCHAR(500) NULL,
  who_answered VARCHAR(40) NULL,
  it_head_call_agreed TINYINT(1) NULL,
  it_head_name VARCHAR(150) NULL,
  it_head_phone VARCHAR(20) NULL,
  it_head_call_date DATE NULL,
  it_head_call_time TIME NULL,
  it_head_call_raw VARCHAR(300) NULL,
  dialect_detected VARCHAR(60) NULL,
  summary TEXT NULL,
  next_action VARCHAR(300) NULL,
  transcript MEDIUMTEXT NULL,
  recording_url VARCHAR(500) NULL,
  duration_sec INT NULL,
  analysis_json LONGTEXT NULL,
  started_at DATETIME NULL,
  end_time DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lead (lead_id), KEY idx_exec (bolna_execution_id), KEY idx_meeting (it_head_call_date),
  CONSTRAINT fk_call_lead FOREIGN KEY (lead_id) REFERENCES pitch_leads(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pitch_call_turns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  call_id INT NOT NULL,
  idx INT NOT NULL DEFAULT 0,
  speaker ENUM('agent','prospect') NOT NULL,
  text TEXT NOT NULL,
  KEY idx_call (call_id),
  CONSTRAINT fk_turn_call FOREIGN KEY (call_id) REFERENCES pitch_calls(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pitch_call_answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  call_id INT NOT NULL,
  question_key VARCHAR(80) NOT NULL,
  response_value TEXT NULL,
  confidence_score DECIMAL(4,2) DEFAULT 1.00,
  UNIQUE KEY uq_call_key (call_id, question_key),
  CONSTRAINT fk_ans_call FOREIGN KEY (call_id) REFERENCES pitch_calls(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pitch_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  username VARCHAR(80) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NULL,
  entity_id VARCHAR(80) NULL,
  details TEXT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_log_user (user_id),
  KEY idx_log_action (action),
  KEY idx_log_entity (entity_type),
  KEY idx_log_created (created_at)
) ENGINE=InnoDB;
