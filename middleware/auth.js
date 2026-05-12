'use strict';

/** Только авторизованные пользователи */
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  req.flash('error', 'Необходима авторизация');
  res.redirect('/auth/login');
}

/** Только администратор */
function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).render('error', { code: 403, message: 'Доступ запрещён' });
}

/** Администратор или фармацевт */
function requireStaff(req, res, next) {
  const role = req.session.user && req.session.user.role;
  if (role === 'admin' || role === 'pharmacist') return next();
  res.status(403).render('error', { code: 403, message: 'Доступ запрещён' });
}

/** Зарегистрированный покупатель */
function requireCustomer(req, res, next) {
  if (req.session.user && req.session.user.role === 'customer') return next();
  req.flash('error', 'Необходима авторизация покупателя');
  res.redirect('/auth/login');
}

module.exports = { requireAuth, requireAdmin, requireStaff, requireCustomer };
