CREATE DATABASE IF NOT EXISTS lunchbot_db;

-- Create user and grant privileges
CREATE USER IF NOT EXISTS 'lunchbot'@'%' IDENTIFIED BY 'securepwd';
GRANT ALL PRIVILEGES ON lunchbot_db.* TO 'lunchbot'@'%';
FLUSH PRIVILEGES;

USE lunchbot_db;

CREATE TABLE IF NOT EXISTS restaurants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  active TINYINT(1) DEFAULT 1,
  orders INT DEFAULT 0
) ENGINE=InnoDB;

INSERT INTO restaurants (name) VALUES
  ('김밥천국'),
  ('맥도날드'),
  ('치킨집'),
  ('분식왕'); 