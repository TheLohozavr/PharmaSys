'use strict';

const express    = require('express');
const router     = express.Router();
const db         = require('../db');
const { requireStaff } = require('../middleware/auth');

router.use(requireStaff);

// GET /stock — текущие остатки
router.get('/', async (req, res) => {
  try {
    const [stock] = await db.query(
      `SELECT v.*, p.id AS pid, p.description, p.is_prescription, p.barcode
       FROM v_stock v JOIN products p ON p.id = v.product_id
       ORDER BY v.group_name, v.product_name`);
    res.render('stock/index', { stock });
  } catch (err) {
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// GET /stock/expiring — просроченные / истекающие
router.get('/expiring', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT sb.*, p.name AS product_name, s.name AS supplier_name
       FROM stock_batches sb
       JOIN products p ON p.id = sb.product_id
       JOIN suppliers s ON s.id = sb.supplier_id
       WHERE sb.expires_at <= DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY)
         AND sb.quantity > 0
       ORDER BY sb.expires_at ASC`);
    res.render('stock/expiring', { rows });
  } catch (err) {
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// GET /stock/receive — форма приёма товара
router.get('/receive', async (req, res) => {
  try {
    const [products]  = await db.query('SELECT id, name FROM products ORDER BY name');
    const [suppliers] = await db.query('SELECT id, name FROM suppliers ORDER BY name');
    res.render('stock/receive', { products, suppliers });
  } catch (err) {
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// POST /stock/receive — оприходовать товар
router.post('/receive', async (req, res) => {
  const { product_id, supplier_id, quantity, cost_price, expires_at, invoice_number } = req.body;
  if (!product_id || !supplier_id || !quantity || !cost_price || !expires_at) {
    req.flash('error', 'Заполните все обязательные поля');
    return res.redirect('/stock/receive');
  }
  try {
    await db.query(
      `INSERT INTO stock_batches (product_id, supplier_id, quantity, cost_price, expires_at, invoice_number)
       VALUES (?,?,?,?,?,?)`,
      [product_id, supplier_id, quantity, cost_price, expires_at, invoice_number || null]);
    req.flash('success', 'Поступление товара зарегистрировано');
    res.redirect('/stock');
  } catch (err) {
    console.error(err);
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

module.exports = router;
