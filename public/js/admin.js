/* PharmaSys — Административные функции с jQuery */
$(function() {
  'use strict';

  // Подтверждение удаления
  $('.delete-confirm').on('click', function(e) {
    if (!confirm('Вы уверены, что хотите удалить этот элемент?')) {
      e.preventDefault();
      return false;
    }
  });

  // Быстрое изменение статуса сотрудника
  $('.toggle-employee-status').on('click', function(e) {
    e.preventDefault();
    var $btn = $(this);
    var url = $btn.attr('href');
    
    $.ajax({
      url: url,
      method: 'POST',
      dataType: 'json',
      success: function(data) {
        if (data.success) {
          $btn.text(data.new_status_text);
          $btn.toggleClass('btn-warning btn-secondary');
          location.reload(); // Обновляем страницу для отображения изменений
        } else {
          alert('Ошибка: ' + data.error);
        }
      },
      error: function() {
        alert('Ошибка соединения с сервером');
      }
    });
  });

  // Фильтрация отчётов по дате
  $('#filter-report').on('submit', function(e) {
    e.preventDefault();
    var dateFrom = $('#date_from').val();
    var dateTo = $('#date_to').val();
    var url = '/admin/reports';
    var params = [];
    if (dateFrom) params.push('date_from=' + dateFrom);
    if (dateTo) params.push('date_to=' + dateTo);
    if (params.length) url += '?' + params.join('&');
    window.location.href = url;
  });

  // Поиск товаров в админке
  var searchTimeout;
  $('#admin-product-search').on('input', function() {
    clearTimeout(searchTimeout);
    var query = $(this).val();
    searchTimeout = setTimeout(function() {
      if (query.length >= 3 || query.length === 0) {
        $('#admin-product-form').submit();
      }
    }, 500);
  });

  // Подсказки для полей ввода
  $('[data-toggle="tooltip"]').tooltip();
});