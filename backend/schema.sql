-- QR Print MVP — Database Schema
-- Run this against your MySQL database to set up the tables.

CREATE DATABASE IF NOT EXISTS qr_print
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE qr_print;

-- ============================================================
-- shops: one row per physical print shop / location
-- For MVP this will have exactly one row (your own shop).
-- ============================================================
CREATE TABLE IF NOT EXISTS shops (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  name                    VARCHAR(255) NOT NULL,
  token                   VARCHAR(64)  NOT NULL UNIQUE COMMENT 'Embedded in the QR URL the customer scans',
  agent_key               VARCHAR(64)  NOT NULL UNIQUE COMMENT 'Secret the Print Agent authenticates with',
  dashboard_password_hash VARCHAR(255) NOT NULL        COMMENT 'bcrypt hash of the dashboard login password',
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- jobs: one row per print job submitted by a customer
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  shop_id         INT          NOT NULL,
  status          ENUM('pending','accepted','rejected','printed','failed','expired')
                               NOT NULL DEFAULT 'pending',
  file_path       VARCHAR(512) NOT NULL   COMMENT 'Path to the uploaded image on disk',
  thumbnail_path  VARCHAR(512) DEFAULT NULL COMMENT 'Small preview for dashboard/notifications',
  width_mm        DECIMAL(8,2) NOT NULL,
  height_mm       DECIMAL(8,2) NOT NULL,
  copies          INT          NOT NULL DEFAULT 1,
  color_mode      ENUM('color','bw') NOT NULL DEFAULT 'color',
  paper_size      VARCHAR(50)  NOT NULL DEFAULT 'A4',
  orientation     ENUM('portrait','landscape') NOT NULL DEFAULT 'portrait',
  reject_reason   VARCHAR(500) DEFAULT NULL,
  reprint_of      INT          DEFAULT NULL COMMENT 'FK to jobs.id if this is a reprint clone',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  printed_at      DATETIME     DEFAULT NULL,
  expires_at      DATETIME     NOT NULL COMMENT 'Auto-purge files after this timestamp',

  CONSTRAINT fk_jobs_shop    FOREIGN KEY (shop_id)    REFERENCES shops(id) ON DELETE CASCADE,
  CONSTRAINT fk_jobs_reprint FOREIGN KEY (reprint_of) REFERENCES jobs(id)  ON DELETE SET NULL,

  INDEX idx_jobs_shop_status (shop_id, status),
  INDEX idx_jobs_expires     (expires_at),
  INDEX idx_jobs_created     (created_at)
) ENGINE=InnoDB;
