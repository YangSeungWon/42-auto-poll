CREATE DATABASE IF NOT EXISTS lunchbot_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user and grant privileges
CREATE USER IF NOT EXISTS 'lunchbot'@'%' IDENTIFIED BY 'securepwd';
GRANT ALL PRIVILEGES ON lunchbot_db.* TO 'lunchbot'@'%';
FLUSH PRIVILEGES;

USE lunchbot_db;

CREATE TABLE IF NOT EXISTS restaurants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  active TINYINT(1) DEFAULT 1,
  orders INT DEFAULT 0
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO restaurants (name) VALUES
  ('온오프 샌드위치'),
  ('한솥 도시락'),
  ('이삭토스트'),
  ('국수나무'),
  ('기센국밥'); 