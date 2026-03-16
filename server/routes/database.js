const express = require('express');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdmin);

// 获取数据库统计信息
router.get('/stats', (req, res) => {
  const db = getDatabase();
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const surgeryCount = db.prepare('SELECT COUNT(*) as count FROM surgeries').get().count;
    const completedSurgeryCount = db.prepare('SELECT COUNT(*) as count FROM surgeries WHERE status = "completed"').get().count;

    const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/hospital.db');
    let dbSize = 0;
    try {
      dbSize = fs.statSync(dbPath).size;
    } catch (e) {}

    res.json({
      userCount,
      surgeryCount,
      completedSurgeryCount,
      dbSize,
      dbPath
    });
  } catch (err) {
    return res.status(500).json({ error: '获取统计信息失败: ' + err.message });
  }
});

// 导出数据库（备份）
router.get('/backup', (req, res) => {
  const db = getDatabase();
  try {
    const users = db.prepare('SELECT id, username, name, role, created_at FROM users').all();
    const surgeries = db.prepare('SELECT * FROM surgeries').all();

    const backup = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: { users, surgeries }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=hospital_backup_${new Date().toISOString().split('T')[0]}.json`);
    res.json(backup);
  } catch (err) {
    return res.status(500).json({ error: '导出用户数据失败: ' + err.message });
  }
});

// 导出完整数据库
router.get('/backup/full', (req, res) => {
  const db = getDatabase();
  try {
    const users = db.prepare('SELECT * FROM users').all();
    const surgeries = db.prepare('SELECT * FROM surgeries').all();

    const backup = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      type: 'full',
      data: { users, surgeries }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=hospital_full_backup_${new Date().toISOString().split('T')[0]}.json`);
    res.json(backup);
  } catch (err) {
    return res.status(500).json({ error: '导出用户数据失败: ' + err.message });
  }
});

// 导入数据库（恢复）
router.post('/restore', (req, res) => {
  const { backup, mode } = req.body;

  if (!backup || !backup.data) {
    return res.status(400).json({ error: '无效的备份数据' });
  }

  const db = getDatabase();
  const replaceMode = mode === 'replace';

  const stats = {
    userImportCount: 0,
    userSkipCount: 0,
    surgeryImportCount: 0,
    surgerySkipCount: 0,
    errors: []
  };

  try {
    if (replaceMode) {
      db.prepare('DELETE FROM surgeries').run();
      db.prepare('DELETE FROM users WHERE username != "admin"').run();
    }

    const users = (backup.data.users || []).filter(u => u.username !== 'admin');
    const surgeries = backup.data.surgeries || [];

    for (const user of users) {
      const password = backup.type === 'full' && user.password
        ? user.password
        : bcrypt.hashSync('changeme123', 10);

      if (!replaceMode) {
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(user.username);
        if (existing) {
          stats.userSkipCount++;
          continue;
        }
      }

      try {
        if (replaceMode) {
          db.prepare(
            'INSERT INTO users (id, username, password, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(user.id, user.username, password, user.name, user.role || 'doctor', user.created_at || new Date().toISOString());
        } else {
          db.prepare(
            'INSERT INTO users (username, password, name, role, created_at) VALUES (?, ?, ?, ?, ?)'
          ).run(user.username, password, user.name, user.role || 'doctor', user.created_at || new Date().toISOString());
        }
        stats.userImportCount++;
      } catch (err) {
        stats.errors.push(`导入用户 ${user.username} 失败: ${err.message}`);
      }
    }

    for (const surgery of surgeries) {
      if (!replaceMode) {
        const existing = db.prepare(
          `SELECT id FROM surgeries WHERE operating_room = ? AND surgery_date = ? AND start_time = ? AND end_time = ? AND patient_name = ?`
        ).get(surgery.operating_room, surgery.surgery_date, surgery.start_time, surgery.end_time, surgery.patient_name);
        if (existing) {
          stats.surgerySkipCount++;
          continue;
        }

        const conflict = db.prepare(
          `SELECT id FROM surgeries WHERE operating_room = ? AND surgery_date = ? 
           AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?) OR (start_time >= ? AND end_time <= ?))`
        ).get(surgery.operating_room, surgery.surgery_date,
          surgery.start_time, surgery.start_time, surgery.end_time, surgery.end_time,
          surgery.start_time, surgery.end_time);
        if (conflict) {
          stats.surgerySkipCount++;
          stats.errors.push(`手术 ${surgery.patient_name} (${surgery.surgery_date} ${surgery.start_time}) 与现有手术冲突，已跳过`);
          continue;
        }
      }

      try {
        if (replaceMode) {
          db.prepare(
            `INSERT INTO surgeries (id, doctor_id, doctor_name, patient_name, surgery_type, surgery_date, 
             start_time, end_time, operating_room, status, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(surgery.id, surgery.doctor_id, surgery.doctor_name, surgery.patient_name, surgery.surgery_type,
            surgery.surgery_date, surgery.start_time, surgery.end_time, surgery.operating_room,
            surgery.status || 'scheduled', surgery.notes || '',
            surgery.created_at || new Date().toISOString(), surgery.updated_at || new Date().toISOString());
        } else {
          db.prepare(
            `INSERT INTO surgeries (doctor_id, doctor_name, patient_name, surgery_type, surgery_date, 
             start_time, end_time, operating_room, status, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(surgery.doctor_id, surgery.doctor_name, surgery.patient_name, surgery.surgery_type,
            surgery.surgery_date, surgery.start_time, surgery.end_time, surgery.operating_room,
            surgery.status || 'scheduled', surgery.notes || '',
            surgery.created_at || new Date().toISOString(), surgery.updated_at || new Date().toISOString());
        }
        stats.surgeryImportCount++;
      } catch (err) {
        stats.errors.push(`导入手术 ${surgery.patient_name} 失败: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: '数据导入完成',
      stats: {
        usersImported: stats.userImportCount,
        usersSkipped: stats.userSkipCount,
        surgeriesImported: stats.surgeryImportCount,
        surgeriesSkipped: stats.surgerySkipCount,
        errors: stats.errors
      }
    });
  } catch (err) {
    res.status(500).json({ error: '导入失败: ' + err.message });
  }
});

// 清空数据库
router.post('/clear', (req, res) => {
  const { confirm } = req.body;

  if (confirm !== 'CONFIRM_CLEAR_ALL_DATA') {
    return res.status(400).json({ error: '请确认清空操作' });
  }

  const db = getDatabase();
  try {
    db.prepare('DELETE FROM surgeries').run();
    db.prepare('DELETE FROM users WHERE username != "admin"').run();
    res.json({ success: true, message: '数据已清空（保留管理员账户）' });
  } catch (err) {
    return res.status(500).json({ error: '清空数据失败: ' + err.message });
  }
});

module.exports = router;
