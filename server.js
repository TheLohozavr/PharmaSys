'use strict';

const express        = require('express');
const session        = require('express-session');
const flash          = require('connect-flash');
const methodOverride = require('method-override');
const path           = require('path');

const app = express();

// ── Шаблонизатор ──────────────────────────────────────────────────────────────
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'pharmacy-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }   // 8 часов
}));

app.use(flash());

// Передаём flash-сообщения и пользователя во все шаблоны
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error   = req.flash('error');
  res.locals.user    = req.session.user || null;
  next();
});

// ── Маршруты ──────────────────────────────────────────────────────────────────
app.use('/',            require('./routes/catalog'));
app.use('/auth',        require('./routes/auth'));
app.use('/admin',       require('./routes/admin'));
app.use('/sales',       require('./routes/sales'));
app.use('/stock',       require('./routes/stock'));
app.use('/orders',      require('./routes/orders'));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).render('error', { code: 404, message: 'Страница не найдена' }));

// ── Запуск ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен: http://localhost:${PORT}`));
