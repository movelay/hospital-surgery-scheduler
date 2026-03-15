const express = require('express');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 获取所有用户（仅管理员）
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  const db = getDatabase();
  db.all('SELECT id, username, name, role, created_at FROM users ORDER BY created_at DESC', (err, users) => {
    if (err) {
      console.error('查询用户失败:', err);
      return res.status(500).json({ error: '查询用户失败: ' + err.message });
    }
    res.json(users);
  });
});

// 获取所有可分配手术的用户列表（管理员和医生都可以访问）
router.get('/doctors', authenticateToken, (req, res) => {
  const db = getDatabase();
  db.all('SELECT id, name, username, role FROM users ORDER BY role, name', (err, doctors) => {
    if (err) {
      console.error('查询医生列表失败:', err);
      return res.status(500).json({ error: '查询医生列表失败: ' + err.message });
    }
    res.json(doctors);
  });
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

  db.run(
    'INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)',
    [username, hashedPassword, name, role],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: '用户名已存在' });
        }
        return res.status(500).json({ error: '创建用户失败' });
      }

      db.get('SELECT id, username, name, role, created_at FROM users WHERE id = ?', [this.lastID], (err, user) => {
        if (err) {
          return res.status(500).json({ error: '查询新用户失败' });
        }
        res.status(201).json(user);
      });
    }
  );
});

// 删除用户（仅管理员）
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: '不能删除自己的账户' });
  }

  const db = getDatabase();

  db.get('SELECT COUNT(*) as count FROM surgeries WHERE doctor_id = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).json({ error: '检查用户关联数据失败' });
    }

    if (result.count > 0) {
      return res.status(400).json({ 
        error: `该用户有 ${result.count} 条关联手术记录，请先删除或转移这些手术后再删除用户` 
      });
    }

    db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: '删除用户失败: ' + err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: '用户不存在' });
      }

      res.json({ message: '用户已删除' });
    });
  });
});

// 更新用户（仅管理员）
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { username, name, role, password } = req.body;

  const db = getDatabase();
  let updateFields = [];
  let updateValues = [];

  if (username) {
    updateFields.push('username = ?');
    updateValues.push(username);
  }
  if (name) {
    updateFields.push('name = ?');
    updateValues.push(name);
  }
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
  const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;

  db.run(sql, updateValues, function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint')) {
        return res.status(400).json({ error: '用户名已存在' });
      }
      return res.status(500).json({ error: '更新用户失败' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    db.get('SELECT id, username, name, role, created_at FROM users WHERE id = ?', [id], (err, user) => {
      if (err) {
        return res.status(500).json({ error: '查询更新后的用户失败' });
      }
      res.json(user);
    });
  });
});

module.exports = router;
