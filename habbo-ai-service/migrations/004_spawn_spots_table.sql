-- Create spawn spots table for AI agents
-- Allows users to save and reuse spawn locations by name
CREATE TABLE IF NOT EXISTS spawn_spots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  room_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  x SMALLINT NOT NULL,
  y SMALLINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Unique constraint ensures no duplicate spot names per user in the same room
  UNIQUE KEY idx_user_room_name (user_id, room_id, name),
  
  -- Fast lookups by room and user
  INDEX idx_room (room_id),
  INDEX idx_user (user_id),
  INDEX idx_user_room (user_id, room_id),
  
  -- Foreign key references (commented for now as they might not exist yet)
  -- FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  -- FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  
  -- Validation constraints
  CHECK (x >= 0 AND x <= 65535),
  CHECK (y >= 0 AND y <= 65535),
  CHECK (LENGTH(name) >= 1 AND LENGTH(name) <= 50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: Add default spawn spots for common locations
-- INSERT INTO spawn_spots (user_id, room_id, name, x, y)
-- VALUES 
--   (0, 0, 'entrance', 3, 3),
--   (0, 0, 'center', 12, 8),
--   (0, 0, 'corner', 1, 1);

-- Note: user_id 0 represents default/global spawn spots available to all users