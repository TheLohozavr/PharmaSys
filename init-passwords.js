'use strict';
const bcrypt = require('bcrypt');
const db     = require('./db');

const ACCOUNTS = [
  { table: 'employees', login: 'admin',  password: 'admin123'  },
  { table: 'employees', login: 'pharma', password: 'pharma123' },
  { table: 'customers', login: 'customer', password: 'cust123' },
];

async function run() {
  console.log('Установка паролей...');
  for (const acc of ACCOUNTS) {
    const hash = await bcrypt.hash(acc.password, 10);
    const [res] = await db.query(
      `UPDATE ${acc.table} SET password = ? WHERE login = ?`,
      [hash, acc.login]);
    if (res.affectedRows > 0) {
      console.log(`  OK: ${acc.table}.${acc.login} -> ${acc.password}`);
    } else {
      console.log(`  ПРОПУЩЕНО: ${acc.login} не найден в ${acc.table}`);
    }
  }
  console.log('Готово. Теперь можно запускать сервер: node server.js');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });