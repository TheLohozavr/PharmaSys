'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireCustomer, requireStaff } = require('../middleware/auth');

// GET /orders/my — история заказов покупателя
router.get('/my', requireCustomer, async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.id, o.status, o.created_at, SUM(oi.quantity * oi.unit_price) AS total
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = ? GROUP BY o.id ORDER BY o.created_at DESC`,
      [req.session.user.id]);
    res.render('orders/my', { orders });
  } catch (err) {
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// GET /orders/new — форма бронирования
router.get('/new', requireCustomer, async (req, res) => {
  try {
    const [products] = await db.query(
      `SELECT v.product_id AS id, v.product_name AS name, v.price, v.quantity
       FROM v_stock v WHERE v.quantity > 0 ORDER BY v.product_name`);
    res.render('orders/new', { products });
  } catch (err) {
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// POST /orders — создать заказ
router.post('/', requireCustomer, async (req, res) => {
  const { comment } = req.body;
  // items приходит как объект {product_id: {quantity, product_id}}
  const rawItems = req.body.items || {};
  const items = Object.values(rawItems).filter(i => Number(i.quantity) > 0);

  if (items.length === 0) {
    req.flash('error', 'Выберите хотя бы один товар');
    return res.redirect('/orders/new');
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRes] = await conn.query(
      'INSERT INTO orders (customer_id, comment) VALUES (?,?)',
      [req.session.user.id, comment || null]);
    const orderId = orderRes.insertId;

    for (const item of items) {
      const pid = Number(item.product_id);
      const qty = Number(item.quantity) || 1;
      if (!pid) continue;

      const [[p]] = await conn.query(
        'SELECT price FROM products WHERE id = ?', [pid]);
      if (!p) continue;

      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?,?,?,?)',
        [orderId, pid, qty, p.price]);
    }

    await conn.commit();
    req.flash('success', 'Бронирование оформлено');
    res.redirect('/orders/my');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  } finally {
    conn.release();
  }
});

// GET /orders/:id — детали заказа
router.get('/:id', requireCustomer, async (req, res) => {
  try {
    const [[order]] = await db.query(
      'SELECT * FROM orders WHERE id = ? AND customer_id = ?',
      [req.params.id, req.session.user.id]);
    if (!order) return res.status(404).render('error', { code: 404, message: 'Заказ не найден' });
    const [items] = await db.query(
      `SELECT oi.*, p.name AS product_name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
      [req.params.id]);
    res.render('orders/detail', { order, items });
  } catch (err) {
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// POST /orders/:id/cancel — отмена заказа покупателем
router.post('/:id/cancel', requireCustomer, async (req, res) => {
  try {
    await db.query(
      "UPDATE orders SET status='cancelled' WHERE id = ? AND customer_id = ? AND status='pending'",
      [req.params.id, req.session.user.id]);
    req.flash('success', 'Заказ отменён');
    res.redirect('/orders/my');
  } catch (err) {
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// GET /orders — список всех заказов (для персонала)
router.get('/', requireStaff, async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.id, o.status, o.created_at, c.full_name AS customer,
              SUM(oi.quantity * oi.unit_price) AS total
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       GROUP BY o.id ORDER BY o.created_at DESC`);
    res.render('orders/list', { orders });
  } catch (err) {
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// POST /orders/:id/status — изменить статус (персонал)
router.post('/:id/status', requireStaff, async (req, res) => {
  const { status } = req.body;
  try {
    await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    req.flash('success', 'Статус заказа обновлён');
    res.redirect('/orders');
  } catch (err) {
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

module.exports = router;
