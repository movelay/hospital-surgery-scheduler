const express = require('express');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 获取所有用户（仅管理员）
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  const db = getDatabase();
  try {
    const users = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (err) {
    console.error('查询用户失败:', err);
    return res.status(500).json({ error: '查询用户失败: ' + err.message });
  }
});

// 获取所有可分配手术的用户列表
router.get('/doctors', authenticateToken, (req, res) => {
  const db = getDatabase();
  try {
    const doctors = db.prepare('SELECT id, name, username, role FROM users ORDER BY role, name').all();
    res.json(doctors);
  } catch (err) {
    console.error('查询医生列表失败:', err);
    return res.status(500).json({ error: '查询医生列表失败: ' + err.message });
  }
});

// 创建用户（仅管理员）
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const { username, password, name, role = 'doctor' } = req.body;

  if (!username || !password || !name) {
    return res.status(400).json({ error: '用户名、密码和姓名不能为空' });
  }

  if (role !== 'admin' && role !== 'doctor') {
    return res.status(400).json({ error: '角色必须是admin或doctor' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const db = getDatabase();

  try {
    const result = db.prepare(
      'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)'
    ).run(username, hashedPassword, name, role);

    const user = db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    return res.status(500).json({ error: '创建用户失败' });
  }
});

// 删除用户（仅管理员）
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: '不能删除自己的账户' });
  }

  const db = getDatabase();

  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM surgeries WHERE doctor_id = ?').get(id);
    if (result.count > 0) {
      return res.status(400).json({ 
        error: `该用户有 ${result.count} 条关联手术记录，请先删除或转移这些手术后再删除用户` 
      });
    }

    const delResult = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (delResult.changes === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ message: '用户已删除' });
  } catch (err) {
    return res.status(500).json({ error: '删除用户失败: ' + err.message });
  }
});

// 更新用户（仅管理员）
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { username, name, role, password } = req.body;

  const db = getDatabase();
  const updateFields = [];
  const updateValues = [];

  if (username) { updateFields.push('username = ?'); updateValues.push(username); }
  if (name) { updateFields.push('name = ?'); updateValues.push(name); }
  if (role) {
    if (role !== 'admin' && role !== 'doctor') {
      return res.status(400).json({ error: '角色必须是admin或doctor' });
    }
    updateFields.push('role = ?');
    updateValues.push(role);
  }
  if (password) {
    updateFields.push('password = ?');
    updateValues.push(bcrypt.hashSync(password, 10));
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: '没有要更新的字段' });
  }

  updateValues.push(id);

  try {
    const result = db.prepare(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateValues);
    if (result.changes === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id = ?').get(id);
    res.json(user);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    return res.status(500).json({ error: '更新用户失败' });
  }
});

module.exports = router;
