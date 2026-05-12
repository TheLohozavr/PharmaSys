'use strict';

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

router.post('/products', async (req, res) => {
  const { name, inn_name, group_id, manufacturer, dosage, form, is_prescription, price, barcode, description } = req.body;
  await db.query(
    `INSERT INTO products (name, inn_name, group_id, manufacturer, dosage, form, is_prescription, price, barcode, description)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [name, inn_name||null, group_id, manufacturer||null, dosage||null, form||null, is_prescription?1:0, price, barcode||null, description||null]);
  req.flash('success', 'Товар добавлен');
  res.redirect('/admin/products');
});

router.get('/products/:id/edit', async (req, res) => {
  const [[product]] = await db.query('SELECT * FROM products WHERE id=?', [req.params.id]);
  const [groups]    = await db.query('SELECT * FROM product_groups');
  if (!product) return res.status(404).render('error', { code: 404, message: 'Товар не найден' });
  res.render('admin/products/form', { product, groups });
});

router.post('/products/:id', async (req, res) => {
  const { name, inn_name, group_id, manufacturer, dosage, form, is_prescription, price, barcode, description } = req.body;
  await db.query(
    `UPDATE products SET name=?,inn_name=?,group_id=?,manufacturer=?,dosage=?,form=?,is_prescription=?,price=?,barcode=?,description=? WHERE id=?`,
    [name, inn_name||null, group_id, manufacturer||null, dosage||null, form||null, is_prescription?1:0, price, barcode||null, description||null, req.params.id]);
  req.flash('success', 'Товар обновлён');
  res.redirect('/admin/products');
});

router.post('/products/:id/delete', async (req, res) => {
  await db.query('DELETE FROM products WHERE id=?', [req.params.id]);
  req.flash('success', 'Товар удалён');
  res.redirect('/admin/products');
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

// ── ПОКУПАТЕЛИ ────────────────────────────────────────────────────────────────
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
