/* PharmaSys — POS (Касса) */
(function () {
  'use strict';

  // Состояние кассы
  var items = [];          // [{product, quantity, prescription_id}]
  var customer = null;
  var pendingRxProduct = null;

  // Вспомогательные функции
  function byId(id) { return document.getElementById(id); }
  function fmt(n) { return Number(n).toFixed(2); }

  // Пересчёт итогов
  function recalc() {
    var subtotal = 0;
    items.forEach(function(i) { subtotal += i.product.price * i.quantity; });

    var discountAmt = 0;
    if (customer) {
      discountAmt = Math.floor(subtotal * Number(customer.discount_pct)) / 100;
    }

    var maxBonus = customer ? Math.min(customer.bonus_points, Math.floor(subtotal - discountAmt)) : 0;

    byId('total-amount').textContent = fmt(subtotal - discountAmt - maxBonus);
    byId('discount-amount').textContent = fmt(discountAmt);
    byId('bonus-used-display').textContent = maxBonus;

    return { subtotal: subtotal, discountAmt: discountAmt, bonusUsed: maxBonus };
  }

  // Отрисовка списка позиций чека
  function renderItems() {
    var list = byId('item-list');
    if (items.length === 0) {
      list.innerHTML = '<p style="color:#aaa;font-size:13px;">Список пуст. Введите штрихкод или ID товара.</p>';
      recalc();
      return;
    }

    var html = '';
    items.forEach(function(item, idx) {
      var rxBadge = item.product.is_prescription
        ? '<span class="badge badge-rx" style="margin-left:6px;">Rx</span>' : '';
      var rxInfo = item.prescription_id
        ? '<span style="font-size:11px;color:#888;"> (рецепт #' + item.prescription_id + ')</span>' : '';
      html += '<div class="pos-item-row">';
      html += '<div style="flex:1;">';
      html += '<strong>' + escHtml(item.product.product_name) + '</strong>' + rxBadge + rxInfo;
      html += '<div style="font-size:12px;color:#888;">' + fmt(item.product.price) + ' ₽/шт.</div>';
      html += '</div>';
      html += '<input type="number" min="1" max="' + item.product.quantity + '" value="' + item.quantity + '"';
      html += ' style="width:64px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;"';
      html += ' onchange="window._posQty(' + idx + ', this.value)">';
      html += '<span style="min-width:80px;text-align:right;font-weight:600;">' + fmt(item.product.price * item.quantity) + ' ₽</span>';
      html += '<button class="btn btn-danger btn-sm" onclick="window._posRm(' + idx + ')">&#x2715;</button>';
      html += '</div>';
    });
    list.innerHTML = html;
    recalc();
  }

  // Экранирование HTML
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Глобальные колбэки из inline-обработчиков
  window._posQty = function(idx, val) {
    var n = Math.max(1, Math.min(parseInt(val, 10) || 1, items[idx].product.quantity));
    items[idx].quantity = n;
    renderItems();
  };
  window._posRm = function(idx) {
    items.splice(idx, 1);
    renderItems();
  };

  // ── Поиск товара ────────────────────────────────────────────
  // Если введён только цифровой ввод — ищем по ID, иначе по штрихкоду
  // ── Поиск товара ────────────────────────────────────────────
function lookupProduct(query, callback) {
  var trimmed = query.trim();
  if (!trimmed) return;
  
  var url;
  //Вариант Б: Если короткое число (меньше 10 цифр) - ищем по ID, иначе по barcode
  if (/^\d+$/.test(trimmed) && trimmed.length < 10) {
    url = '/sales/lookup?id=' + encodeURIComponent(trimmed);
  } else {
    url = '/sales/lookup?barcode=' + encodeURIComponent(trimmed);
  }
  
  console.log('Поиск по URL:', url);
  
  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) { 
      console.log('Ответ:', data);
      callback(data); 
    })
    .catch(function(err) { 
      console.error('Ошибка:', err);
      callback({ error: 'Ошибка соединения с сервером' }); 
    });
}

// Обработчик сканирования
byId('btn-scan').addEventListener('click', function() {
  var q = byId('barcode-input').value.trim();
  if (!q) { 
    byId('barcode-input').focus(); 
    return; 
  }

  lookupProduct(q, function(data) {
    if (data.error) {
      byId('lookup-error').textContent = data.error;
      console.error('Ошибка поиска:', data.error);
      return;
    }
    
    if (!data.product) {
      byId('lookup-error').textContent = 'Неверный формат ответа сервера';
      return;
    }
    
    byId('lookup-error').textContent = '';
    var p = data.product;
    
    console.log('Найден товар:', p);  // Для отладки

    // Проверяем обязательные поля
    if (!p.product_id || !p.product_name) {
      byId('lookup-error').textContent = 'Ошибка: товар не содержит ID или названия';
      return;
    }

    // Проверяем наличие на складе
    if (!p.quantity || p.quantity <= 0) {
      byId('lookup-error').textContent = 'Товар отсутствует на складе';
      return;
    }

    // Проверяем — уже есть в чеке?
    var found = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].product.product_id == p.product_id) {
        found = items[i];
        break;
      }
    }

    if (found) {
      if (found.quantity < p.quantity) {
        found.quantity++;
        renderItems();
      } else {
        byId('lookup-error').textContent = 'Доступно только ' + p.quantity + ' шт.';
      }
      byId('barcode-input').value = '';
      return;
    }

    // Рецептурный — открываем форму рецепта
    if (p.is_prescription) {
      pendingRxProduct = p;
      byId('rx-product-name').textContent = 'Препарат: ' + p.product_name;
      byId('rx-modal').style.display = 'flex';
    } else {
      items.push({ 
        product: {
          product_id: p.product_id,
          product_name: p.product_name,
          price: p.price,
          quantity: p.quantity,
          is_prescription: p.is_prescription
        }, 
        quantity: 1, 
        prescription_id: null 
      });
      renderItems();
    }
    byId('barcode-input').value = '';
  });
});

  byId('barcode-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') byId('btn-scan').click();
  });

  // ── Рецепт ──────────────────────────────────────────────────
  byId('btn-rx-ok').addEventListener('click', function() {
    var num = byId('rx-number').value.trim();
    var dt  = byId('rx-date').value;
    if (!num || !dt) {
      byId('rx-error').textContent = 'Введите номер рецепта и дату выдачи';
      return;
    }
    byId('rx-error').textContent = '';

    // Сохраняем рецепт на сервере
    var body = JSON.stringify({
      series:       byId('rx-series').value.trim(),
      number:       num,
      issued_at:    dt,
      doctor_name:  byId('rx-doctor').value.trim(),
      patient_name: byId('rx-patient').value.trim(),
      product_id:   pendingRxProduct.product_id
    });

    fetch('/sales/prescription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) { byId('rx-error').textContent = data.error; return; }
      items.push({ product: pendingRxProduct, quantity: 1, prescription_id: data.prescription_id });
      renderItems();
      // Очистить форму
      ['rx-series','rx-number','rx-date','rx-doctor','rx-patient'].forEach(function(id) {
        byId(id).value = '';
      });
      byId('rx-modal').style.display = 'none';
      pendingRxProduct = null;
    })
    .catch(function() {
      byId('rx-error').textContent = 'Ошибка соединения с сервером';
    });
  });

  byId('btn-rx-cancel').addEventListener('click', function() {
    byId('rx-modal').style.display = 'none';
    pendingRxProduct = null;
    ['rx-series','rx-number','rx-date','rx-doctor','rx-patient'].forEach(function(id) {
      byId(id).value = '';
    });
    byId('rx-error').textContent = '';
  });

  // ── Поиск покупателя ────────────────────────────────────────
  byId('btn-find-customer').addEventListener('click', function() {
    var card = byId('card-input').value.trim();
    if (!card) return;

    fetch('/sales/customer?card=' + encodeURIComponent(card))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          byId('customer-info').innerHTML = '<span style="color:#dc3545;">' + escHtml(data.error) + '</span>';
          customer = null;
          recalc();
          return;
        }
        customer = data.customer;
        byId('customer-info').innerHTML =
          '<strong>' + escHtml(customer.full_name) + '</strong><br>' +
          'Карта: ' + (customer.card_number || '—') +
          ' | Бонусы: ' + customer.bonus_points +
          ' | Скидка: ' + customer.discount_pct + '%';
        recalc();
      })
      .catch(function() {
        byId('customer-info').innerHTML = '<span style="color:#dc3545;">Ошибка соединения</span>';
      });
  });

  byId('card-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') byId('btn-find-customer').click();
  });

  // ── Проведение продажи ──────────────────────────────────────
  byId('btn-confirm').addEventListener('click', function() {
    if (items.length === 0) { alert('Добавьте товары в чек'); return; }
    if (!confirm('Провести продажу?')) return;

    var totals = recalc();
    var payload = {
      items: items.map(function(i) {
        return {
          product_id:      i.product.product_id,
          quantity:        i.quantity,
          prescription_id: i.prescription_id || null
        };
      }),
      customer_id: customer ? customer.id : null,
      bonus_use:   totals.bonusUsed
    };

    fetch('/sales', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) { alert('Ошибка: ' + data.error); return; }
      alert(
        'Продажа #' + data.sale_id + ' проведена!\n' +
        'Итого: ' + fmt(data.total) + ' руб.\n' +
        'Скидка: ' + fmt(data.discount) + ' руб.\n' +
        'Начислено бонусов: ' + data.bonus_accrued
      );
      window.location.href = '/sales/' + data.sale_id;
    })
    .catch(function() { alert('Ошибка соединения с сервером'); });
  });

  // ── Отмена ──────────────────────────────────────────────────
  byId('btn-cancel').addEventListener('click', function() {
    if (items.length > 0 && !confirm('Отменить текущую продажу?')) return;
    items = [];
    customer = null;
    byId('customer-info').innerHTML = '';
    byId('card-input').value = '';
    byId('lookup-error').textContent = '';
    renderItems();
  });

  // Инициализация
  renderItems();
})();