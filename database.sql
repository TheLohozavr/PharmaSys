-- ============================================================
--  Аптека — полная схема БД (MySQL)
--  Вариант 18: Клиент-серверное приложение «Аптека»
--  Запускать: mysql --default-character-set=utf8mb4 -u root -p < database.sql
-- ============================================================

SET NAMES utf8mb4;
SET character_set_client = utf8mb4;
SET character_set_connection = utf8mb4;
SET character_set_results = utf8mb4;
SET collation_connection = utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS pharmacy_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pharmacy_db;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS prescriptions;
DROP TABLE IF EXISTS stock_batches;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS product_groups;
DROP TABLE IF EXISTS roles;
DROP VIEW  IF EXISTS v_stock;

-- ─────────────────────────────────────────────
--  РОЛИ
-- ─────────────────────────────────────────────

CREATE TABLE roles (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
--  СПРАВОЧНИКИ
-- ─────────────────────────────────────────────

CREATE TABLE product_groups (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suppliers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  inn          VARCHAR(20),
  phone        VARCHAR(30),
  email        VARCHAR(100),
  address      TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  inn_name        VARCHAR(200),
  group_id        INT NOT NULL,
  manufacturer    VARCHAR(200),
  dosage          VARCHAR(100),
  form            VARCHAR(100),
  is_prescription TINYINT(1) NOT NULL DEFAULT 0,
  price           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  barcode         VARCHAR(50),
  description     TEXT,
  image_url       VARCHAR(300),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_group FOREIGN KEY (group_id) REFERENCES product_groups(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_products_group   ON products(group_id);
CREATE INDEX idx_products_barcode ON products(barcode);

-- ─────────────────────────────────────────────
--  СОТРУДНИКИ И ПОКУПАТЕЛИ
-- ─────────────────────────────────────────────

CREATE TABLE employees (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  full_name    VARCHAR(200) NOT NULL,
  login        VARCHAR(100) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  role_id      INT NOT NULL,
  phone        VARCHAR(30),
  email        VARCHAR(100),
  hired_at     DATE,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_emp_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  full_name    VARCHAR(200) NOT NULL,
  login        VARCHAR(100) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  phone        VARCHAR(30),
  email        VARCHAR(100),
  card_number  VARCHAR(30) UNIQUE,
  bonus_points INT NOT NULL DEFAULT 0,
  discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
--  СКЛАД
-- ─────────────────────────────────────────────

CREATE TABLE stock_batches (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  product_id     INT NOT NULL,
  supplier_id    INT NOT NULL,
  quantity       INT NOT NULL DEFAULT 0,
  cost_price     DECIMAL(10,2) NOT NULL,
  expires_at     DATE NOT NULL,
  received_at    DATE NOT NULL DEFAULT (CURRENT_DATE),
  invoice_number VARCHAR(100),
  CONSTRAINT fk_batch_product  FOREIGN KEY (product_id)  REFERENCES products(id),
  CONSTRAINT fk_batch_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_batch_product ON stock_batches(product_id);

-- Представление: актуальные остатки + все поля для каталога
CREATE OR REPLACE VIEW v_stock AS
  SELECT
    p.id              AS product_id,
    p.name            AS product_name,
    p.inn_name,
    p.manufacturer,
    p.dosage,
    p.form,
    p.barcode,
    p.description,
    p.image_url,
    p.price,
    p.is_prescription,
    p.group_id,
    pg.name           AS group_name,
    COALESCE(SUM(CASE WHEN sb.expires_at >= CURRENT_DATE THEN sb.quantity ELSE 0 END), 0) AS quantity,
    MIN(CASE WHEN sb.expires_at >= CURRENT_DATE THEN sb.expires_at END) AS nearest_expiry
  FROM products p
  JOIN product_groups pg ON p.group_id = pg.id
  LEFT JOIN stock_batches sb ON sb.product_id = p.id
  GROUP BY p.id;

-- ─────────────────────────────────────────────
--  РЕЦЕПТЫ
-- ─────────────────────────────────────────────

CREATE TABLE prescriptions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  series         VARCHAR(20),
  number         VARCHAR(30) NOT NULL,
  issued_at      DATE NOT NULL,
  doctor_name    VARCHAR(200),
  patient_name   VARCHAR(200),
  product_id     INT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rx_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
--  ПРОДАЖИ
-- ─────────────────────────────────────────────

CREATE TABLE sales (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  employee_id     INT NOT NULL,
  customer_id     INT,
  total           DECIMAL(10,2) NOT NULL,
  discount_amt    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  bonus_used      INT NOT NULL DEFAULT 0,
  bonus_accrued   INT NOT NULL DEFAULT 0,
  status          ENUM('completed','returned') NOT NULL DEFAULT 'completed',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sale_emp  FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_sale_cust FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  sale_id         INT NOT NULL,
  product_id      INT NOT NULL,
  prescription_id INT,
  quantity        INT NOT NULL,
  unit_price      DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_si_sale    FOREIGN KEY (sale_id)         REFERENCES sales(id),
  CONSTRAINT fk_si_product FOREIGN KEY (product_id)      REFERENCES products(id),
  CONSTRAINT fk_si_rx      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
--  ЗАКАЗЫ (бронирование через веб-витрину)
-- ─────────────────────────────────────────────

CREATE TABLE orders (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT NOT NULL,
  status       ENUM('pending','ready','completed','cancelled') NOT NULL DEFAULT 'pending',
  comment      TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_cust FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL,
  product_id  INT NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  unit_price  DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_oi_order   FOREIGN KEY (order_id)   REFERENCES orders(id),
  CONSTRAINT fk_oi_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ═══════════════════════════════════════════
--  НАЧАЛЬНЫЕ ДАННЫЕ
-- ═══════════════════════════════════════════

INSERT INTO roles (name) VALUES ('admin'), ('pharmacist'), ('customer');

INSERT INTO product_groups (name, description) VALUES
  ('Лекарства',   'Рецептурные и безрецептурные препараты'),
  ('БАДы',        'Биологически активные добавки'),
  ('Косметика',   'Косметические и гигиенические средства'),
  ('Медтехника',  'Медицинские приборы и изделия');

INSERT INTO suppliers (name, inn, phone, email, address) VALUES
  ('ФармаПоставка', '7701234567', '+7-495-111-22-33', 'supply@pharmadist.ru', 'Москва, ул. Аптечная, 5'),
  ('МедТрейд',      '7709876543', '+7-495-444-55-66', 'info@medtrade.ru',     'Санкт-Петербург, пр. Лекарей, 12');

-- ВАЖНО: пароли — временные заглушки.
-- После импорта обязательно запустить: node init-passwords.js
-- Логины и пароли: admin/admin123, pharma/pharma123, customer/cust123
INSERT INTO employees (full_name, login, password, role_id, phone, hired_at) VALUES
  ('Администратов Алексей Иванович', 'admin',  'PLACEHOLDER', 1, '+7-900-000-00-01', '2020-01-01'),
  ('Фармацевтова Мария Петровна',    'pharma', 'PLACEHOLDER', 2, '+7-900-000-00-02', '2021-06-15');

INSERT INTO customers (full_name, login, password, phone, email, card_number, bonus_points, discount_pct) VALUES
  ('Иванов Иван Иванович', 'customer', 'PLACEHOLDER', '+7-900-100-20-30', 'ivanov@mail.ru', 'CARD-00001', 150, 5.00);

INSERT INTO products (name, inn_name, group_id, manufacturer, dosage, form, is_prescription, price, barcode, description) VALUES
  ('Парацетамол 500мг N20',  'Парацетамол',          1, 'Фармстандарт',    '500 мг',  'Таблетки', 0,    65.00, '4607001234561', 'Жаропонижающее и обезболивающее средство'),
  ('Ибупрофен 200мг N50',    'Ибупрофен',            1, 'Озон',            '200 мг',  'Таблетки', 0,   120.00, '4607001234562', 'НПВС, обезболивающее, противовоспалительное'),
  ('Амоксициллин 250мг N16', 'Амоксициллин',         1, 'КРКА',            '250 мг',  'Капсулы',  1,   185.00, '4607001234563', 'Антибиотик широкого спектра. Отпускается по рецепту'),
  ('Омепразол 20мг N30',     'Омепразол',            1, 'Биосинтез',       '20 мг',   'Капсулы',  0,    95.00, '4607001234564', 'Ингибитор протонной помпы, лечение язвы'),
  ('Витамин C 1000мг N60',   'Аскорбиновая кислота', 2, 'Эвалар',          '1000 мг', 'Таблетки', 0,   350.00, '4607001234565', 'Иммуностимулятор, витаминный комплекс'),
  ('Крем Пантенол 30г',      NULL,                   3, 'Белмедпрепараты', NULL,       'Крем',     0,   210.00, '4607001234566', 'Заживляющий крем, пантенол 5%'),
  ('Тонометр AND UA-777',    NULL,                   4, 'AND',             NULL,       'Прибор',   0,  1850.00, '4607001234567', 'Автоматическое измерение артериального давления');

INSERT INTO stock_batches (product_id, supplier_id, quantity, cost_price, expires_at, received_at, invoice_number) VALUES
  (1, 1, 100,  42.00,   '2026-12-01', '2025-01-10', 'INV-2025-001'),
  (2, 1,  60,  80.00,   '2027-06-01', '2025-01-10', '2025-01-10'),
  (3, 2,  30, 130.00,   '2026-09-01', '2025-02-01', 'INV-2025-002'),
  (4, 1,  80,  60.00,   '2027-01-01', '2025-01-10', 'INV-2025-001'),
  (5, 2,  50, 250.00,   '2026-11-01', '2025-02-01', 'INV-2025-002'),
  (6, 1,  40, 140.00,   '2026-08-01', '2025-01-10', 'INV-2025-001'),
  (7, 2,  10, 1400.00,  '2028-01-01', '2025-02-01', 'INV-2025-002');