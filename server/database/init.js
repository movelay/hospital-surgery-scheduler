const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// 支持从环境变量读取数据库路径
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/hospital.db');

// 确保数据库目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 创建持久的数据库连接
const db = new Database(DB_PATH);

// 启用外键约束
db.pragma('foreign_keys = ON');

// 获取数据库连接
function getDatabase() {
  return db;
}

// 关闭数据库连接
function closeDatabase() {
  db.close();
  return Promise.resolve();
}

// 初始化数据库表
function initDatabase() {
  return new Promise((resolve, reject) => {
    try {
      // 创建用户表
      db.exec(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'doctor',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 创建手术表
      db.exec(`CREATE TABLE IF NOT EXISTS surgeries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doctor_id INTEGER NOT NULL,
        doctor_name TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        surgery_type TEXT NOT NULL,
        surgery_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        operating_room TEXT NOT NULL,
        status TEXT DEFAULT 'scheduled',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (doctor_id) REFERENCES users(id)
      )`);

      // 检查并创建默认管理员账户
      const row = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
      if (!row) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.prepare(
          'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)'
        ).run('admin', hashedPassword, '系统管理员', 'admin');
        console.log('默认管理员账户已创建: admin / admin123');
      } else {
        console.log('数据库初始化完成');
      }
      console.log('数据库路径:', DB_PATH);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { getDatabase, initDatabase, closeDatabase };
