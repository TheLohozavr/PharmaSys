'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');
const router  = express.Router();
const db      = require('../db');

// GET /auth/login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login');
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    req.flash('error', 'Введите логин и пароль');
    return res.redirect('/auth/login');
  }

  try {
    // Сначала ищем среди сотрудников
    let [rows] = await db.query(
      `SELECT e.id, e.full_name, e.login, e.password, r.name AS role
       FROM employees e JOIN roles r ON e.role_id = r.id
       WHERE e.login = ? AND e.is_active = 1`, [login]);

    if (rows.length === 0) {
      // Затем среди покупателей
      [rows] = await db.query(
        `SELECT id, full_name, login, password, 'customer' AS role
         FROM customers WHERE login = ?`, [login]);
    }

    if (rows.length === 0) {
      req.flash('error', 'Неверное имя пользователя или пароль');
      return res.redirect('/auth/login');
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      req.flash('error', 'Неверное имя пользователя или пароль');
      return res.redirect('/auth/login');
    }

    req.session.user = { id: user.id, name: user.full_name, login: user.login, role: user.role };
    req.flash('success', `Добро пожаловать, ${user.full_name}!`);

    if (user.role === 'admin')      return res.redirect('/admin');
    if (user.role === 'pharmacist') return res.redirect('/sales');
    res.redirect('/orders/my');
  } catch (err) {
    console.error(err);
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// GET /auth/register
router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/register');
});

// POST /auth/register
router.post('/register', async (req, res) => {
  const { full_name, login, password, password2, phone, email } = req.body;

  if (!full_name || !login || !password) {
    req.flash('error', 'Заполните обязательные поля');
    return res.redirect('/auth/register');
  }
  if (password !== password2) {
    req.flash('error', 'Пароли не совпадают');
    return res.redirect('/auth/register');
  }

  try {
    const [existing] = await db.query('SELECT id FROM customers WHERE login = ?', [login]);
    if (existing.length > 0) {
      req.flash('error', 'Логин уже занят');
      return res.redirect('/auth/register');
    }

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO customers (full_name, login, password, phone, email) VALUES (?,?,?,?,?)',
      [full_name, login, hash, phone || null, email || null]);

    req.flash('success', 'Регистрация успешна. Войдите в систему.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    res.render('error', { code: 500, message: 'Ошибка сервера' });
  }
});

// GET /auth/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
