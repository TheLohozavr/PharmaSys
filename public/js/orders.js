/* PharmaSys — Создание заказа с jQuery */
$(function() {
  'use strict';

  // Функция пересчёта итога
  function recalcTotal() {
    var total = 0;
    $('.order-item').each(function() {
      var $row = $(this);
      var price = parseFloat($row.find('.item-price').data('price')) || 0;
      var quantity = parseInt($row.find('.item-quantity').val()) || 0;
      var subtotal = price * quantity;
      $row.find('.item-subtotal').text(subtotal.toFixed(2) + ' ₽');
      total += subtotal;
    });
    $('#order-total').text(total.toFixed(2) + ' ₽');
  }

  // Добавление товара в заказ
  $('.add-to-order').on('click', function() {
    var $btn = $(this);
    var productId = $btn.data('id');
    var productName = $btn.data('name');
    var productPrice = parseFloat($btn.data('price'));
    var maxStock = parseInt($btn.data('stock')) || 0;

    // Проверяем, есть ли уже этот товар в заказе
    var $existing = $('.order-item[data-product-id="' + productId + '"]');
    
    if ($existing.length) {
      // Увеличиваем количество
      var $qtyInput = $existing.find('.item-quantity');
      var newQty = Math.min(parseInt($qtyInput.val()) + 1, maxStock);
      $qtyInput.val(newQty).trigger('change');
    } else {
      // Добавляем новую строку
      var $row = $('<div class="order-item" data-product-id="' + productId + '">');
      $row.html(`
        <input type="hidden" name="items[${productId}][product_id]" value="${productId}">
        <div class="pos-item-row">
          <div style="flex:1;">
            <strong>${escapeHtml(productName)}</strong>
            <div style="font-size:12px;color:#888;">${productPrice.toFixed(2)} ₽/шт.</div>
          </div>
          <input type="number" class="item-quantity" name="items[${productId}][quantity]" 
                 value="1" min="1" max="${maxStock}" style="width:70px;">
          <span class="item-price" data-price="${productPrice}"></span>
          <span class="item-subtotal" style="min-width:80px;text-align:right;">${productPrice.toFixed(2)} ₽</span>
          <button type="button" class="btn btn-danger btn-sm remove-item">✕</button>
        </div>
      `);
      $('#order-items-list').append($row);
    }

    recalcTotal();
  });

  // Удаление позиции
  $(document).on('click', '.remove-item', function() {
    $(this).closest('.order-item').remove();
    recalcTotal();
  });

  // Изменение количества
  $(document).on('change', '.item-quantity', function() {
    var $input = $(this);
    var maxStock = parseInt($input.attr('max')) || 999;
    var val = parseInt($input.val()) || 1;
    if (val > maxStock) {
      $input.val(maxStock);
      alert('Доступно только ' + maxStock + ' шт.');
    }
    recalcTotal();
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Проверка перед отправкой
  $('#order-form').on('submit', function() {
    if ($('.order-item').length === 0) {
      alert('Добавьте хотя бы один товар в заказ');
      return false;
    }
    return confirm('Оформить заказ?');
  });

  recalcTotal();
});