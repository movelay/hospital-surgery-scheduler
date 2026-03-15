const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');

const router = express.Router();

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const db = getDatabase();
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: '数据库查询错误' });
    }

    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err || !isMatch) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, name: user.name },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role
        }
      });
    });
  });
});

// 获取当前用户信息
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    name: req.user.name,
    role: req.user.role
  });
});

module.exports = router;
