CREATE TABLE IF NOT EXISTS qr_login_tickets (
  id BIGINT NOT NULL AUTO_INCREMENT,
  ticket_hash CHAR(64) NOT NULL,
  short_code CHAR(6) NOT NULL,
  status ENUM('pending', 'confirmed', 'used', 'expired') NOT NULL DEFAULT 'pending',
  portal_user_id INT NULL,
  requested_ip VARCHAR(64) NOT NULL DEFAULT '',
  requested_user_agent VARCHAR(255) NOT NULL DEFAULT '',
  expires_at DATETIME NOT NULL,
  confirmed_at DATETIME NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_qr_login_ticket_hash (ticket_hash),
  KEY idx_qr_login_user (portal_user_id),
  KEY idx_qr_login_expiry (expires_at),
  CONSTRAINT fk_qr_login_user
    FOREIGN KEY (portal_user_id) REFERENCES portal_users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
