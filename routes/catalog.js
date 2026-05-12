'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET / — каталог
router.get('/', async (req, res) => {
  const { search, group_id } = req.query;

  let sql = `SELECT * FROM v_stock WHERE 1=1`;
  const params = [];

  if (search) {
    sql += ` AND (product_name LIKE ? OR inn_name LIKE ? OR manufacturer LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (group_id) {
    sql += ` AND group_id = ?`;
    params.push(parseInt(group_id, 10));
  }
  sql += ' ORDER BY product_name';

  try {
    const [products] = await db.query(sql, params);
    const [groups]   = await db.query('SELECT * FROM product_groups ORDER BY name');
    res.render('catalog/index', {
      products,
      groups,
      search:   search || '',
      group_id: group_id || ''
    });
  } catch (err) {
    console.error(err);
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// GET /product/:id — карточка товара
router.get('/product/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM v_stock WHERE product_id = ?`,
      [parseInt(req.params.id, 10)]);

    if (rows.length === 0) {
      return res.status(404).render('error', { code: 404, message: 'Товар не найден' });
    }
    res.render('catalog/product', { product: rows[0] });
  } catch (err) {
    console.error(err);
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

module.exports = router;