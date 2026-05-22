/* PharmaSys — POS (Касса) с jQuery */
$(function() {
  'use strict';

  var items = [];
  var customer = null;
  var pendingRxProduct = null;

  function fmt(n) { return Number(n).toFixed(2); }

  function recalc() {
    var subtotal = 0;
    $.each(items, function(i, item) {
      subtotal += item.product.price * item.quantity;
    });

    var discountAmt = 0;
    if (customer) {
      discountAmt = Math.floor(subtotal * Number(customer.discount_pct)) / 100;
    }

    var maxBonus = customer ? Math.min(customer.bonus_points, Math.floor(subtotal - discountAmt)) : 0;

    $('#total-amount').text(fmt(subtotal - discountAmt - maxBonus));
    $('#discount-amount').text(fmt(discountAmt));
    $('#bonus-used-display').text(maxBonus);

    return { subtotal: subtotal, discountAmt: discountAmt, bonusUsed: maxBonus };
  }

  function renderItems() {
    var $list = $('#item-list');
    if (items.length === 0) {
      $list.html('<p style="color:#aaa;font-size:13px;">Список пуст. Введите штрихкод или ID товара.</p>');
      recalc();
      return;
    }

    var html = '';
    $.each(items, function(idx, item) {
      var rxBadge = item.product.is_prescription
        ? '<span class="badge badge-rx" style="margin-left:6px;">Rx</span>' : '';
      var rxInfo = item.prescription_id
        ? '<span style="font-size:11px;color:#888;"> (рецепт #' + item.prescription_id + ')</span>' : '';
      html += '<div class="pos-item-row">';
      html += '<div style="flex:1;">';
      html += '<strong>' + escapeHtml(item.product.product_name) + '</strong>' + rxBadge + rxInfo;
      html += '<div style="font-size:12px;color:#888;">' + fmt(item.product.price) + ' ₽/шт.</div>';
      html += '</div>';
      html += '<input type="number" min="1" max="' + item.product.quantity + '" value="' + item.quantity + '"';
      html += ' style="width:64px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;"';
      html += ' data-idx="' + idx + '" class="pos-qty-input">';
      html += '<span style="min-width:80px;text-align:right;font-weight:600;">' + fmt(item.product.price * item.quantity) + ' ₽</span>';
      html += '<button class="btn btn-danger btn-sm" data-idx="' + idx + '">&#x2715;</button>';
      html += '</div>';
    });
    $list.html(html);
    recalc();
  }

  // Экранирование HTML
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Поиск товара
  function lookupProduct(query, callback) {
    var trimmed = query.trim();
    if (!trimmed) return;
    
    var url;
    if (/^\d+$/.test(trimmed) && trimmed.length < 10) {
      url = '/sales/lookup?id=' + encodeURIComponent(trimmed);
    } else {
      url = '/sales/lookup?barcode=' + encodeURIComponent(trimmed);
    }
    
    $.ajax({
      url: url,
      method: 'GET',
      dataType: 'json',
      success: function(data) {
        callback(data);
      },
      error: function(xhr, status, error) {
        console.error('Ошибка:', error);
        callback({ error: 'Ошибка соединения с сервером' });
      }
    });
  }

  // Обработчик сканирования
  $('#btn-scan').on('click', function() {
    var q = $('#barcode-input').val().trim();
    if (!q) { 
      $('#barcode-input').focus(); 
      return; 
    }

    lookupProduct(q, function(data) {
      if (data.error) {
        $('#lookup-error').text(data.error);
        return;
      }
      
      if (!data.product) {
        $('#lookup-error').text('Неверный формат ответа сервера');
        return;
      }
      
      $('#lookup-error').text('');
      var p = data.product;

      if (!p.product_id || !p.product_name) {
        $('#lookup-error').text('Ошибка: товар не содержит ID или названия');
        return;
      }

      if (!p.quantity || p.quantity <= 0) {
        $('#lookup-error').text('Товар отсутствует на складе');
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
          $('#lookup-error').text('Доступно только ' + p.quantity + ' шт.');
        }
        $('#barcode-input').val('');
        return;
      }

      // Рецептурный — открываем форму рецепта
      if (p.is_prescription) {
        pendingRxProduct = p;
        $('#rx-product-name').text('Препарат: ' + p.product_name);
        $('#rx-modal').fadeIn(200);
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
      $('#barcode-input').val('');
    });
  });

  $(document).on('change', '.pos-qty-input', function() {
    var idx = $(this).data('idx');
    var val = $(this).val();
    var n = Math.max(1, Math.min(parseInt(val, 10) || 1, items[idx].product.quantity));
    items[idx].quantity = n;
    renderItems();
  });

  $(document).on('click', '.pos-item-row .btn-danger', function() {
    var idx = $(this).data('idx');
    items.splice(idx, 1);
    renderItems();
  });

  $('#barcode-input').on('keypress', function(e) {
    if (e.which === 13) $('#btn-scan').click();
  });

  // Рецепт
  $('#btn-rx-ok').on('click', function() {
    var num = $('#rx-number').val().trim();
    var dt  = $('#rx-date').val();
    if (!num || !dt) {
      $('#rx-error').text('Введите номер рецепта и дату выдачи');
      return;
    }
    $('#rx-error').text('');

    var body = JSON.stringify({
      series:       $('#rx-series').val().trim(),
      number:       num,
      issued_at:    dt,
      doctor_name:  $('#rx-doctor').val().trim(),
      patient_name: $('#rx-patient').val().trim(),
      product_id:   pendingRxProduct.product_id
    });

    $.ajax({
      url: '/sales/prescription',
      method: 'POST',
      contentType: 'application/json',
      data: body,
      dataType: 'json',
      success: function(data) {
        if (data.error) { 
          $('#rx-error').text(data.error); 
          return; 
        }
        items.push({ product: pendingRxProduct, quantity: 1, prescription_id: data.prescription_id });
        renderItems();
        $('#rx-series, #rx-number, #rx-date, #rx-doctor, #rx-patient').val('');
        $('#rx-modal').fadeOut(200);
        pendingRxProduct = null;
      },
      error: function() {
        $('#rx-error').text('Ошибка соединения с сервером');
      }
    });
  });

  $('#btn-rx-cancel').on('click', function() {
    $('#rx-modal').fadeOut(200);
    pendingRxProduct = null;
    $('#rx-series, #rx-number, #rx-date, #rx-doctor, #rx-patient').val('');
    $('#rx-error').text('');
  });

  // Поиск покупателя
  $('#btn-find-customer').on('click', function() {
    var card = $('#card-input').val().trim();
    if (!card) return;

    $.ajax({
      url: '/sales/customer?card=' + encodeURIComponent(card),
      method: 'GET',
      dataType: 'json',
      success: function(data) {
        if (data.error) {
          $('#customer-info').html('<span style="color:#dc3545;">' + escapeHtml(data.error) + '</span>');
          customer = null;
          recalc();
          return;
        }
        customer = data.customer;
        $('#customer-info').html(
          '<strong>' + escapeHtml(customer.full_name) + '</strong><br>' +
          'Карта: ' + (customer.card_number || '—') +
          ' | Бонусы: ' + customer.bonus_points +
          ' | Скидка: ' + customer.discount_pct + '%'
        );
        recalc();
      },
      error: function() {
        $('#customer-info').html('<span style="color:#dc3545;">Ошибка соединения</span>');
      }
    });
  });

  $('#card-input').on('keypress', function(e) {
    if (e.which === 13) $('#btn-find-customer').click();
  });

  // Проведение продажи
  $('#btn-confirm').on('click', function() {
    if (items.length === 0) { 
      alert('Добавьте товары в чек'); 
      return; 
    }
    if (!confirm('Провести продажу?')) return;

    var totals = recalc();
    var payload = {
      items: $.map(items, function(item) {
        return {
          product_id:      item.product.product_id,
          quantity:        item.quantity,
          prescription_id: item.prescription_id || null
        };
      }),
      customer_id: customer ? customer.id : null,
      bonus_use:   totals.bonusUsed
    };

    $.ajax({
      url: '/sales',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload),
      dataType: 'json',
      success: function(data) {
        if (data.error) { 
          alert('Ошибка: ' + data.error); 
          return; 
        }
        alert(
          'Продажа #' + data.sale_id + ' проведена!\n' +
          'Итого: ' + fmt(data.total) + ' руб.\n' +
          'Скидка: ' + fmt(data.discount) + ' руб.\n' +
          'Начислено бонусов: ' + data.bonus_accrued
        );
        window.location.href = '/sales/' + data.sale_id;
      },
      error: function() { 
        alert('Ошибка соединения с сервером'); 
      }
    });
  });

  // Отмена
  $('#btn-cancel').on('click', function() {
    if (items.length > 0 && !confirm('Отменить текущую продажу?')) return;
    items = [];
    customer = null;
    $('#customer-info').html('');
    $('#card-input').val('');
    $('#lookup-error').text('');
    renderItems();
  });

  // Инициализация
  renderItems();
});