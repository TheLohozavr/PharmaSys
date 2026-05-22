'use strict';

const upload = require('../middleware/upload');
const fs = require('fs');
const path = require('path');
const express    = require('express');
const bcrypt     = require('bcrypt');
const router     = express.Router();
const db         = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /admin — дашборд
router.get('/', async (req, res) => {
  try {
    const [[{ cnt_products }]] = await db.query('SELECT COUNT(*) AS cnt_products FROM products');
    const [[{ cnt_employees }]] = await db.query('SELECT COUNT(*) AS cnt_employees FROM employees WHERE is_active=1');
    const [[{ cnt_customers }]] = await db.query('SELECT COUNT(*) AS cnt_customers FROM customers');
    const [[{ today_sales }]]  = await db.query("SELECT COALESCE(SUM(total),0) AS today_sales FROM sales WHERE DATE(created_at)=CURRENT_DATE");
    res.render('admin/dashboard', { cnt_products, cnt_employees, cnt_customers, today_sales });
  } catch (err) {
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// ── ТОВАРЫ ────────────────────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const [products] = await db.query(
    `SELECT p.*, pg.name AS group_name FROM products p JOIN product_groups pg ON p.group_id=pg.id ORDER BY p.name`);
  const [groups] = await db.query('SELECT * FROM product_groups');
  res.render('admin/products/index', { products, groups });
});

router.get('/products/new', async (req, res) => {
  const [groups] = await db.query('SELECT * FROM product_groups');
  res.render('admin/products/form', { product: null, groups });
});

router.post('/products', upload.single('image'), async (req, res) => {
  const { name, inn_name, group_id, manufacturer, dosage, form, is_prescription, price, barcode, description } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO products (name, inn_name, group_id, manufacturer, dosage, form, is_prescription, price, barcode, description)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [name, inn_name||null, group_id, manufacturer||null, dosage||null, form||null, is_prescription?1:0, price, barcode||null, description||null]);
    const productId = result.insertId;

    // Если загружено изображение – переименовываем файл
    if (req.file) {
      const oldPath = req.file.path;
      const ext = path.extname(req.file.originalname).toLowerCase();
      const newFileName = `${productId}${ext}`;
      const newPath = path.join(path.dirname(oldPath), newFileName);
      fs.renameSync(oldPath, newPath);
      await conn.query('UPDATE products SET image = ? WHERE id = ?', [newFileName, productId]);
    }

    await conn.commit();
    req.flash('success', 'Товар добавлен');
    res.redirect('/admin/products');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash('error', 'Ошибка при добавлении товара');
    res.redirect('/admin/products/new');
  } finally {
    conn.release();
  }
});

// GET /admin/products/:id/edit — форма редактирования (без изменений)
router.get('/products/:id/edit', async (req, res) => {
  const [[product]] = await db.query('SELECT * FROM products WHERE id=?', [req.params.id]);
  const [groups]    = await db.query('SELECT * FROM product_groups');
  if (!product) return res.status(404).render('error', { code: 404, message: 'Товар не найден' });
  res.render('admin/products/form', { product, groups });
});

// Обновление товара через POST (более простой способ)
router.post('/products/:id/update', upload.single('image'), async (req, res) => {
  const { name, inn_name, group_id, manufacturer, dosage, form, is_prescription, price, barcode, description } = req.body;
  const productId = req.params.id;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Обновляем основную информацию
    await conn.query(
      `UPDATE products SET name=?, inn_name=?, group_id=?, manufacturer=?, dosage=?, form=?, is_prescription=?, price=?, barcode=?, description=?
       WHERE id=?`,
      [name, inn_name||null, group_id, manufacturer||null, dosage||null, form||null, is_prescription?1:0, price, barcode||null, description||null, productId]);

    // Обработка изображения
    if (req.file) {
      // Удаляем старое изображение, если есть
      const [[oldProduct]] = await conn.query('SELECT image FROM products WHERE id = ?', [productId]);
      if (oldProduct && oldProduct.image) {
        const oldPath = path.join(__dirname, '../public/uploads/products', oldProduct.image);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      // Переименовываем новый файл
      const ext = path.extname(req.file.originalname).toLowerCase();
      const newFileName = `${productId}${ext}`;
      const newPath = path.join(path.dirname(req.file.path), newFileName);
      fs.renameSync(req.file.path, newPath);
      await conn.query('UPDATE products SET image = ? WHERE id = ?', [newFileName, productId]);
    }

    await conn.commit();
    req.flash('success', 'Товар обновлён');
    res.redirect('/admin/products');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash('error', 'Ошибка при обновлении товара');
    res.redirect(`/admin/products/${productId}/edit`);
  } finally {
    conn.release();
  }
});

// Также исправьте DELETE для товара
router.delete('/products/:id', async (req, res) => {
  const productId = req.params.id;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // Получаем имя изображения
    const [[product]] = await conn.query('SELECT image FROM products WHERE id = ?', [productId]);
    if (product && product.image) {
      const imagePath = path.join(__dirname, '../public/uploads/products', product.image);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
    await conn.query('DELETE FROM products WHERE id = ?', [productId]);
    await conn.commit();
    req.flash('success', 'Товар удалён');
    res.redirect('/admin/products');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash('error', 'Ошибка при удалении товара');
    res.redirect('/admin/products');
  } finally {
    conn.release();
  }
});

// ── СОТРУДНИКИ ────────────────────────────────────────────────────────────────
router.get('/employees', async (req, res) => {
  const [employees] = await db.query(
    `SELECT e.*, r.name AS role_name FROM employees e JOIN roles r ON r.id=e.role_id ORDER BY e.full_name`);
  res.render('admin/employees/index', { employees });
});

router.get('/employees/new', async (req, res) => {
  const [roles] = await db.query("SELECT * FROM roles WHERE name != 'customer'");
  res.render('admin/employees/form', { employee: null, roles });
});

router.post('/employees', async (req, res) => {
  const { full_name, login, password, role_id, phone, email, hired_at } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await db.query(
    'INSERT INTO employees (full_name, login, password, role_id, phone, email, hired_at) VALUES (?,?,?,?,?,?,?)',
    [full_name, login, hash, role_id, phone||null, email||null, hired_at||null]);
  req.flash('success', 'Сотрудник зарегистрирован');
  res.redirect('/admin/employees');
});

router.post('/employees/:id/toggle', async (req, res) => {
  await db.query('UPDATE employees SET is_active = 1 - is_active WHERE id=?', [req.params.id]);
  req.flash('success', 'Статус сотрудника изменён');
  res.redirect('/admin/employees');
});

// GET /admin/employees/:id/edit — форма редактирования
router.get('/employees/:id/edit', async (req, res) => {
  const [[employee]] = await db.query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
  if (!employee) return res.status(404).render('error', { code: 404, message: 'Сотрудник не найден' });
  const [roles] = await db.query("SELECT * FROM roles WHERE name != 'customer'");
  res.render('admin/employees/form', { employee, roles });
});

// POST /admin/employees/:id — обновить сотрудника
router.post('/employees/:id', async (req, res) => {
  const { full_name, login, role_id, phone, email, hired_at, password } = req.body;
  const id = req.params.id;
  let query = `UPDATE employees SET full_name=?, login=?, role_id=?, phone=?, email=?, hired_at=?`;
  const params = [full_name, login, role_id, phone||null, email||null, hired_at||null];
  if (password && password.trim() !== '') {
    const hash = await bcrypt.hash(password, 10);
    query += `, password=?`;
    params.push(hash);
  }
  query += ` WHERE id=?`;
  params.push(id);
  await db.query(query, params);
  req.flash('success', 'Данные сотрудника обновлены');
  res.redirect('/admin/employees');
});

// POST /admin/employees/:id/delete — удалить сотрудника (полное удаление)
router.post('/employees/:id/delete', async (req, res) => {
  await db.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
  req.flash('success', 'Сотрудник удалён');
  res.redirect('/admin/employees');
});

// ── ПОКУПАТЕЛИ ────────────────────────────────────────────────────────────────
// GET /admin/customers/new — форма добавления покупателя
router.get('/customers/new', async (req, res) => {
  res.render('admin/customers/form', { customer: null });
});

// POST /admin/customers — создать покупателя
router.post('/customers', async (req, res) => {
  const { full_name, login, password, phone, email, card_number, discount_pct } = req.body;
  if (!full_name || !login || !password) {
    req.flash('error', 'Заполните обязательные поля (ФИО, логин, пароль)');
    return res.redirect('/admin/customers/new');
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO customers (full_name, login, password, phone, email, card_number, discount_pct, bonus_points)
       VALUES (?,?,?,?,?,?,?,0)`,
      [full_name, login, hash, phone||null, email||null, card_number||null, discount_pct||0]);
    req.flash('success', 'Покупатель добавлен');
    res.redirect('/admin/customers');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Ошибка при создании покупателя (возможно, логин уже существует)');
    res.redirect('/admin/customers/new');
  }
});

// GET /admin/customers/:id/edit — форма редактирования
router.get('/customers/:id/edit', async (req, res) => {
  const [[customer]] = await db.query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!customer) return res.status(404).render('error', { code: 404, message: 'Покупатель не найден' });
  res.render('admin/customers/form', { customer });
});

// POST /admin/customers/:id — обновить покупателя
router.post('/customers/:id', async (req, res) => {
  const { full_name, login, phone, email, card_number, discount_pct, bonus_points, password } = req.body;
  const id = req.params.id;
  let query = `UPDATE customers SET full_name=?, login=?, phone=?, email=?, card_number=?, discount_pct=?, bonus_points=?`;
  const params = [full_name, login, phone||null, email||null, card_number||null, discount_pct||0, bonus_points||0];
  if (password && password.trim() !== '') {
    const hash = await bcrypt.hash(password, 10);
    query += `, password=?`;
    params.push(hash);
  }
  query += ` WHERE id=?`;
  params.push(id);
  await db.query(query, params);
  req.flash('success', 'Данные покупателя обновлены');
  res.redirect('/admin/customers');
});

// POST /admin/customers/:id/delete — удалить покупателя
router.post('/customers/:id/delete', async (req, res) => {
  await db.query('DELETE FROM customers WHERE id = ?', [req.params.id]);
  req.flash('success', 'Покупатель удалён');
  res.redirect('/admin/customers');
});

router.get('/customers', async (req, res) => {
  const [customers] = await db.query('SELECT * FROM customers ORDER BY full_name');
  res.render('admin/customers/index', { customers });
});

// ── ПОСТАВЩИКИ ────────────────────────────────────────────────────────────────
router.get('/suppliers', async (req, res) => {
  const [suppliers] = await db.query('SELECT * FROM suppliers ORDER BY name');
  res.render('admin/suppliers/index', { suppliers });
});

router.get('/suppliers/new', (req, res) => res.render('admin/suppliers/form', { supplier: null }));

router.post('/suppliers', async (req, res) => {
  const { name, inn, phone, email, address } = req.body;
  await db.query('INSERT INTO suppliers (name, inn, phone, email, address) VALUES (?,?,?,?,?)',
    [name, inn||null, phone||null, email||null, address||null]);
  req.flash('success', 'Поставщик добавлен');
  res.redirect('/admin/suppliers');
});

router.get('/suppliers/:id/edit', async (req, res) => {
  const [[supplier]] = await db.query('SELECT * FROM suppliers WHERE id=?', [req.params.id]);
  res.render('admin/suppliers/form', { supplier });
});

router.post('/suppliers/:id', async (req, res) => {
  const { name, inn, phone, email, address } = req.body;
  await db.query('UPDATE suppliers SET name=?,inn=?,phone=?,email=?,address=? WHERE id=?',
    [name, inn||null, phone||null, email||null, address||null, req.params.id]);
  req.flash('success', 'Поставщик обновлён');
  res.redirect('/admin/suppliers');
});

// ── РЕЦЕПТЫ ────────────────────────────────────────────────────────────────
router.get('/prescriptions', async (req, res) => {
  try {
    const [prescriptions] = await db.query(`
      SELECT 
        p.id,
        p.series,
        p.number,
        p.issued_at,
        p.doctor_name,
        p.patient_name,
        pr.name AS product_name,
        s.id AS sale_id,
        s.created_at AS sale_date,
        c.full_name AS customer_name,
        e.full_name AS employee_name
      FROM prescriptions p
      JOIN products pr ON pr.id = p.product_id
      LEFT JOIN sale_items si ON si.prescription_id = p.id
      LEFT JOIN sales s ON s.id = si.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN employees e ON e.id = s.employee_id
      ORDER BY p.issued_at DESC
    `);
    res.render('admin/prescriptions/index', { prescriptions });
  } catch (err) {
    console.error(err);
    res.render('error', { code: 500, message: 'Ошибка загрузки рецептов' });
  }
});

// Детальный просмотр рецепта
router.get('/prescriptions/:id', async (req, res) => {
  try {
    const [[prescription]] = await db.query(`
      SELECT 
        p.*,
        pr.name AS product_name,
        pr.price AS product_price,
        s.id AS sale_id,
        s.created_at AS sale_date,
        s.total AS sale_total,
        c.full_name AS customer_name,
        e.full_name AS employee_name,
        si.quantity AS sold_quantity,
        si.unit_price AS sold_price
      FROM prescriptions p
      JOIN products pr ON pr.id = p.product_id
      LEFT JOIN sale_items si ON si.prescription_id = p.id
      LEFT JOIN sales s ON s.id = si.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN employees e ON e.id = s.employee_id
      WHERE p.id = ?
    `, [req.params.id]);
    
    if (!prescription) {
      return res.status(404).render('error', { code: 404, message: 'Рецепт не найден' });
    }
    res.render('admin/prescriptions/detail', { prescription });
  } catch (err) {
    console.error(err);
    res.render('error', { code: 500, message: 'Ошибка загрузки рецепта' });
  }
});

// ── ОТЧЁТЫ ────────────────────────────────────────────────────────────────────
router.get('/reports', async (req, res) => {
  const { date_from, date_to } = req.query;
  let sql = `SELECT DATE(s.created_at) AS dt, COUNT(*) AS cnt, SUM(s.total) AS revenue
             FROM sales s WHERE s.status='completed'`;
  const params = [];
  if (date_from) { sql += ' AND DATE(s.created_at)>=?'; params.push(date_from); }
  if (date_to)   { sql += ' AND DATE(s.created_at)<=?'; params.push(date_to); }
  sql += ' GROUP BY DATE(s.created_at) ORDER BY dt DESC';

  const [salesReport] = await db.query(sql, params);

  const [expiredStock] = await db.query(
    `SELECT p.name, sb.quantity, sb.expires_at, sup.name AS supplier
     FROM stock_batches sb JOIN products p ON p.id=sb.product_id
     JOIN suppliers sup ON sup.id=sb.supplier_id
     WHERE sb.expires_at < CURRENT_DATE AND sb.quantity > 0`);

  res.render('admin/reports', { salesReport, expiredStock, date_from, date_to });
});

module.exports = router;
