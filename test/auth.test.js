// test/auth.test.js
const chai = require('chai');
const expect = chai.expect;

// Импортируем middleware для тестирования
const { requireAuth, requireAdmin, requireStaff, requireCustomer } = require('../middleware/auth');

describe('Middleware авторизации', function() {
  
  // Тест 1: requireAuth — нет сессии
  it('requireAuth должен редиректить, если пользователь не в сессии', function() {
    const req = { session: {} };
    const res = {
      redirect: function(url) { this.redirectUrl = url; },
      locals: {}
    };
    req.flash = function(type, msg) { this.flashMsg = msg; };
    
    requireAuth(req, res, function() {});
    
    expect(res.redirectUrl).to.equal('/auth/login');
  });

  // Тест 2: requireAuth — есть сессия
  it('requireAuth должен пропускать авторизованного пользователя', function() {
    const req = { session: { user: { id: 1, role: 'admin' } } };
    let nextCalled = false;
    
    requireAuth(req, {}, function() { nextCalled = true; });
    
    expect(nextCalled).to.be.true;
  });

  // Тест 3: requireAdmin — не админ
  it('requireAdmin должен блокировать не-админа с кодом 403', function() {
    const req = { session: { user: { role: 'pharmacist' } } };
    let renderedCode = null;
    const res = {
      status: function(code) { this.statusCode = code; return this; },
      render: function(template, data) { renderedCode = data.code; }
    };
    
    requireAdmin(req, res, function() {});
    
    expect(res.statusCode).to.equal(403);
    expect(renderedCode).to.equal(403);
  });

  // Тест 4: requireStaff — admin проходит
  it('requireStaff должен пропускать admin', function() {
    const req = { session: { user: { role: 'admin' } } };
    let nextCalled = false;
    
    requireStaff(req, {}, function() { nextCalled = true; });
    
    expect(nextCalled).to.be.true;
  });

  // Тест 5: requireCustomer — не покупатель
  it('requireCustomer должен редиректить гостя на логин', function() {
    const req = { session: {} };
    const res = {
      redirect: function(url) { this.redirectUrl = url; }
    };
    req.flash = function() {};
    
    requireCustomer(req, res, function() {});
    
    expect(res.redirectUrl).to.equal('/auth/login');
  });
});