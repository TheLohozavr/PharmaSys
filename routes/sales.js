'use strict';

const express    = require('express');
const router     = express.Router();
const db         = require('../db');
const { requireStaff } = require('../middleware/auth');

router.use(requireStaff);

// ── GET /sales — страница кассы ───────────────────────────────
router.get('/', (req, res) => res.render('sales/index', { title: 'Касса' }));

// ── GET /sales/history — перед /:id! ──────────────────────────
router.get('/history', async (req, res) => {
  const { date_from, date_to } = req.query;
  let sql = `
    SELECT s.id, s.created_at, s.total, s.discount_amt, s.bonus_used, s.status,
           e.full_name AS employee, c.full_name AS customer
    FROM sales s
    JOIN employees e ON e.id = s.employee_id
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE 1=1`;
  const params = [];
  if (date_from) { sql += ' AND DATE(s.created_at) >= ?'; params.push(date_from); }
  if (date_to)   { sql += ' AND DATE(s.created_at) <= ?'; params.push(date_to); }
  sql += ' ORDER BY s.created_at DESC LIMIT 300';

  try {
    const [sales] = await db.query(sql, params);
    res.render('sales/history', { sales, date_from: date_from || '', date_to: date_to || '' });
  } catch (err) {
    console.error(err);
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// ── GET /sales/lookup — AJAX поиск товара ────────────────────
// ?id=N    → поиск по product_id
// ?barcode=X → поиск по штрихкоду
router.get('/lookup', async (req, res) => {
  const { barcode, id } = req.query;
  try {
    let rows;
    if (id && /^\d+$/.test(id)) {
      [rows] = await db.query(
        `SELECT v.* FROM v_stock v WHERE v.product_id = ?`,
        [parseInt(id, 10)]);
    } else if (barcode) {
      [rows] = await db.query(
        `SELECT v.* FROM v_stock v WHERE v.barcode = ?`,
        [barcode]);
    } else {
      return res.json({ error: 'Укажите id или barcode' });
    }

    if (rows.length === 0) return res.json({ error: 'Товар не найден в базе' });
    const p = rows[0];
    if (p.quantity <= 0) return res.json({ error: 'Товар отсутствует на складе' });
    res.json({ product: p });
  } catch (err) {
    console.error(err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// ── GET /sales/customer — AJAX поиск покупателя ──────────────
router.get('/customer', async (req, res) => {
  const { card } = req.query;
  if (!card) return res.json({ error: 'Не указан параметр поиска' });
  try {
    const [rows] = await db.query(
      `SELECT id, full_name, card_number, bonus_points, discount_pct
       FROM customers WHERE card_number = ? OR login = ?`,
      [card, card]);
    if (rows.length === 0) return res.json({ error: 'Покупатель не найден' });
    res.json({ customer: rows[0] });
  } catch (err) {
    console.error(err);
    res.json({ error: 'Ошибка сервера' });
  }
});

// ── POST /sales/prescription — сохранить рецепт ──────────────
router.post('/prescription', async (req, res) => {
  const { series, number, issued_at, doctor_name, patient_name, product_id } = req.body;
  if (!number || !issued_at) return res.json({ error: 'Укажите номер и дату рецепта' });
  try {
    const [result] = await db.query(
      `INSERT INTO prescriptions (series, number, issued_at, doctor_name, patient_name, product_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [series || null, number, issued_at, doctor_name || null, patient_name || null, product_id || null]);
    res.json({ prescription_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.json({ error: 'Ошибка сохранения рецепта' });
  }
});

// ── POST /sales — провести продажу (JSON) ────────────────────
router.post('/', async (req, res) => {
  const { items, customer_id, bonus_use } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ error: 'Пустой список товаров' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Загрузить данные покупателя
    let customer = null;
    if (customer_id) {
      const [cr] = await conn.query(
        'SELECT id, bonus_points, discount_pct FROM customers WHERE id = ?', [customer_id]);
      if (cr.length > 0) customer = cr[0];
    }

    // Проверить каждую позицию
    let subtotal = 0;
    const lines = [];

    for (const item of items) {
      const pid = parseInt(item.product_id, 10);
      const qty = parseInt(item.quantity, 10);
      if (!pid || qty < 1) continue;

      const [rows] = await conn.query(
        `SELECT v.quantity AS stock, v.price, v.is_prescription
         FROM v_stock v WHERE v.product_id = ?`, [pid]);
      if (rows.length === 0) throw new Error(`Товар ID=${pid} не найден`);

      const p = rows[0];
      if (p.stock < qty) throw new Error(`Недостаточно товара ID=${pid} (есть: ${p.stock})`);

      subtotal += Number(p.price) * qty;
      lines.push({
        product_id:      pid,
        quantity:        qty,
        unit_price:      Number(p.price),
        prescription_id: item.prescription_id ? parseInt(item.prescription_id, 10) : null
      });
    }

    // Скидка и бонусы
    let discountAmt = 0;
    let bonusUsed   = 0;
    let bonusAccrued = 0;

    if (customer) {
      discountAmt = Math.floor(subtotal * Number(customer.discount_pct)) / 100;
      const maxBonus = Math.min(
        parseInt(bonus_use, 10) || 0,
        customer.bonus_points,
        Math.floor(subtotal - discountAmt)
      );
      bonusUsed = Math.max(0, maxBonus);
    }

    const finalTotal = subtotal - discountAmt - bonusUsed;
    bonusAccrued = customer ? Math.floor(finalTotal * 0.01) : 0;

    // Создать запись продажи
    const [saleRes] = await conn.query(
      `INSERT INTO sales (employee_id, customer_id, total, discount_amt, bonus_used, bonus_accrued)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.user.id, customer_id || null, finalTotal, discountAmt, bonusUsed, bonusAccrued]);
    const saleId = saleRes.insertId;

    // Позиции + списание со склада (FIFO по сроку годности)
    for (const line of lines) {
      await conn.query(
        `INSERT INTO sale_items (sale_id, product_id, prescription_id, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [saleId, line.product_id, line.prescription_id, line.quantity, line.unit_price]);

      let toDeduct = line.quantity;
      const [batches] = await conn.query(
        `SELECT id, quantity FROM stock_batches
         WHERE product_id = ? AND quantity > 0 AND expires_at >= CURRENT_DATE
         ORDER BY expires_at ASC`, [line.product_id]);

      for (const b of batches) {
        if (toDeduct <= 0) break;
        const deduct = Math.min(b.quantity, toDeduct);
        await conn.query(
          'UPDATE stock_batches SET quantity = quantity - ? WHERE id = ?', [deduct, b.id]);
        toDeduct -= deduct;
      }
    }

    // Обновить бонусы покупателя
    if (customer) {
      await conn.query(
        'UPDATE customers SET bonus_points = bonus_points - ? + ? WHERE id = ?',
        [bonusUsed, bonusAccrued, customer_id]);
    }

    await conn.commit();
    res.json({
      success:       true,
      sale_id:       saleId,
      total:         finalTotal,
      discount:      discountAmt,
      bonus_used:    bonusUsed,
      bonus_accrued: bonusAccrued
    });

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── GET /sales/:id — чек ──────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[sale]] = await db.query(
      `SELECT s.*, e.full_name AS employee, c.full_name AS customer
       FROM sales s
       JOIN employees e ON e.id = s.employee_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ?`, [req.params.id]);

    if (!sale) return res.status(404).render('error', { code: 404, message: 'Продажа не найдена' });

    const [items] = await db.query(
      `SELECT si.*, p.name AS product_name
       FROM sale_items si JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = ?`, [req.params.id]);

    res.render('sales/receipt', { sale, items });
  } catch (err) {
    console.error(err);
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

module.exports = router;