'use strict';

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || '7777',
  database: process.env.DB_NAME     || 'pharmacy_db',
  waitForConnections: true,
  connectionLimit:    10,
  timezone: '+03:00'
});

pool.on('connection', function(connection) {
  connection.query("SET NAMES 'utf8mb4'");
  connection.query("SET character_set_results = 'utf8mb4'");
});
 
module.exports = pool;