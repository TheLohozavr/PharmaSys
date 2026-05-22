'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Страница профиля
router.get('/', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const role = req.session.user.role;
  let user = null;

  if (role === 'customer') {
    const [rows] = await db.query('SELECT id, full_name, login, phone, email, card_number, discount_pct, bonus_points FROM customers WHERE id = ?', [userId]);
    if (rows.length) user = rows[0];
  } else {
    const [rows] = await db.query('SELECT id, full_name, login, phone, email, role_id FROM employees WHERE id = ?', [userId]);
    if (rows.length) user = rows[0];
  }

  if (!user) return res.status(404).render('error', { code: 404, message: 'Пользователь не найден' });
  res.render('profile/index', { user, role });
});

// Обновление основных данных (без пароля)
router.post('/', requireAuth, async (req, res) => {
  const { full_name, phone, email } = req.body;
  const userId = req.session.user.id;
  const role = req.session.user.role;
  let table = (role === 'customer') ? 'customers' : 'employees';
  try {
    await db.query(`UPDATE ${table} SET full_name=?, phone=?, email=? WHERE id=?`, [full_name, phone||null, email||null, userId]);
    // Обновим имя в сессии
    req.session.user.name = full_name;
    req.flash('success', 'Данные обновлены');
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Ошибка при обновлении');
    res.redirect('/profile');
  }
});

// Смена пароля
router.post('/password', requireAuth, async (req, res) => {
  const { old_password, new_password, new_password2 } = req.body;
  if (!old_password || !new_password || new_password !== new_password2) {
    req.flash('error', 'Пароли не совпадают или не заполнены');
    return res.redirect('/profile');
  }
  const userId = req.session.user.id;
  const role = req.session.user.role;
  const table = (role === 'customer') ? 'customers' : 'employees';
  try {
    const [rows] = await db.query(`SELECT password FROM ${table} WHERE id = ?`, [userId]);
    if (rows.length === 0) throw new Error('Пользователь не найден');
    const match = await bcrypt.compare(old_password, rows[0].password);
    if (!match) {
      req.flash('error', 'Неверный текущий пароль');
      return res.redirect('/profile');
    }
    const hash = await bcrypt.hash(new_password, 10);
    await db.query(`UPDATE ${table} SET password = ? WHERE id = ?`, [hash, userId]);
    req.flash('success', 'Пароль изменён');
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Ошибка при смене пароля');
    res.redirect('/profile');
  }
});

module.exports = router;