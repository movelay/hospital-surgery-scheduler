const express = require('express');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const { getDatabase } = require('../database/init');
const { statement } = require('../database/statements');
const { findConflict } = require('../database/conflicts');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { localDateString } = require('../utils/schedule');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const restoreParser = bodyParser.json({ limit: '50mb' });

router.use(authenticateToken);
router.use(requireAdmin);

function databasePath() {
  return process.env.DB_PATH || path.join(__dirname, '../../data/hospital.db');
}

function databaseFileSize(dbPath) {
  let size = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      size += fs.statSync(dbPath + suffix).size;
    } catch (err) {
      // 文件不存在时忽略
    }
  }
  return size;
}

router.get('/stats', (req, res) => {
  const db = getDatabase();
  try {
    const counts = statement(db, `
      SELECT
        (SELECT COUNT(*) FROM users) AS userCount,
        (SELECT COUNT(*) FROM surgeries) AS surgeryCount,
        (SELECT COUNT(*) FROM surgeries WHERE status = 'completed') AS completedSurgeryCount
    `).get();
    const dbPath = databasePath();

    res.json({
      userCount: counts.userCount,
      surgeryCount: counts.surgeryCount,
      completedSurgeryCount: counts.completedSurgeryCount,
      dbSize: databaseFileSize(dbPath),
      dbPath
    });
  } catch (err) {
    return res.status(500).json({ error: '获取统计信息失败: ' + err.message });
  }
});

function sendBackup(res, backup, filename) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.json(backup);
}

router.get('/backup', (req, res) => {
  const db = getDatabase();
  try {
    const users = statement(db, 'SELECT id, username, name, role, created_at FROM users').all();
    const surgeries = statement(db, 'SELECT * FROM surgeries').all();
    sendBackup(res, {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: { users, surgeries }
    }, `hospital_backup_${localDateString()}.json`);
  } catch (err) {
    return res.status(500).json({ error: '导出用户数据失败: ' + err.message });
  }
});

router.get('/backup/full', (req, res) => {
  const db = getDatabase();
  try {
    const users = statement(db, 'SELECT * FROM users').all();
    const surgeries = statement(db, 'SELECT * FROM surgeries').all();
    sendBackup(res, {
      version: '1.0',
      exportDate: new Date().toISOString(),
      type: 'full',
      data: { users, surgeries }
    }, `hospital_full_backup_${localDateString()}.json`);
  } catch (err) {
    return res.status(500).json({ error: '导出用户数据失败: ' + err.message });
  }
});

router.post('/restore', restoreParser, (req, res) => {
  const { backup, mode } = req.body;

  if (!backup || !backup.data) {
    return res.status(400).json({ error: '无效的备份数据' });
  }

  const db = getDatabase();
  const replaceMode = mode === 'replace';
  const fallbackPassword = bcrypt.hashSync('changeme123', 10);

  const deleteSurgeries = statement(db, 'DELETE FROM surgeries');
  const deleteUsers = statement(db, 'DELETE FROM users WHERE username != ?');
  const findUser = statement(db, 'SELECT id FROM users WHERE username = ?');
  const insertUserReplace = statement(
    db,
    'INSERT INTO users (id, username, password, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertUserMerge = statement(
    db,
    'INSERT INTO users (username, password, name, role, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const findDuplicateSurgery = statement(
    db,
    `SELECT id FROM surgeries
     WHERE operating_room = ? AND surgery_date = ? AND start_time = ? AND end_time = ? AND patient_name = ?`
  );
  const insertSurgeryReplace = statement(
    db,
    `INSERT INTO surgeries
     (id, doctor_id, doctor_name, patient_name, surgery_type, surgery_date,
      start_time, end_time, operating_room, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSurgeryMerge = statement(
    db,
    `INSERT INTO surgeries
     (doctor_id, doctor_name, patient_name, surgery_type, surgery_date,
      start_time, end_time, operating_room, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  try {
    const stats = db.transaction(() => {
      const result = {
        userImportCount: 0,
        userSkipCount: 0,
        surgeryImportCount: 0,
        surgerySkipCount: 0,
        errors: []
      };

      if (replaceMode) {
        deleteSurgeries.run();
        deleteUsers.run('admin');
      }

      const users = (backup.data.users || []).filter(user => user.username !== 'admin');
      const surgeries = backup.data.surgeries || [];

      for (const user of users) {
        const password = backup.type === 'full' && user.password
          ? user.password
          : fallbackPassword;

        if (!replaceMode && findUser.get(user.username)) {
          result.userSkipCount++;
          continue;
        }

        try {
          const createdAt = user.created_at || new Date().toISOString();
          if (replaceMode) {
            insertUserReplace.run(user.id, user.username, password, user.name, user.role || 'doctor', createdAt);
          } else {
            insertUserMerge.run(user.username, password, user.name, user.role || 'doctor', createdAt);
          }
          result.userImportCount++;
        } catch (err) {
          result.errors.push(`导入用户 ${user.username} 失败: ${err.message}`);
        }
      }

      for (const surgery of surgeries) {
        if (!replaceMode) {
          const duplicate = findDuplicateSurgery.get(
            surgery.operating_room,
            surgery.surgery_date,
            surgery.start_time,
            surgery.end_time,
            surgery.patient_name
          );
          if (duplicate) {
            result.surgerySkipCount++;
            continue;
          }

          if (surgery.status !== 'cancelled') {
            const conflict = findConflict(db, {
              room: surgery.operating_room,
              date: surgery.surgery_date,
              start: surgery.start_time,
              end: surgery.end_time
            });
            if (conflict) {
              result.surgerySkipCount++;
              result.errors.push(`手术 ${surgery.patient_name} (${surgery.surgery_date} ${surgery.start_time}) 与现有手术冲突，已跳过`);
              continue;
            }
          }
        }

        try {
          const createdAt = surgery.created_at || new Date().toISOString();
          const updatedAt = surgery.updated_at || new Date().toISOString();
          const status = surgery.status || 'scheduled';
          const notes = surgery.notes || '';
          if (replaceMode) {
            insertSurgeryReplace.run(
              surgery.id, surgery.doctor_id, surgery.doctor_name, surgery.patient_name, surgery.surgery_type,
              surgery.surgery_date, surgery.start_time, surgery.end_time, surgery.operating_room,
              status, notes, createdAt, updatedAt
            );
          } else {
            insertSurgeryMerge.run(
              surgery.doctor_id, surgery.doctor_name, surgery.patient_name, surgery.surgery_type,
              surgery.surgery_date, surgery.start_time, surgery.end_time, surgery.operating_room,
              status, notes, createdAt, updatedAt
            );
          }
          result.surgeryImportCount++;
        } catch (err) {
          result.errors.push(`导入手术 ${surgery.patient_name} 失败: ${err.message}`);
        }
      }

      return result;
    })();

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

router.post('/clear', (req, res) => {
  const { confirm } = req.body;

  if (confirm !== 'CONFIRM_CLEAR_ALL_DATA') {
    return res.status(400).json({ error: '请确认清空操作' });
  }

  const db = getDatabase();
  try {
    const clearAll = db.transaction(() => {
      statement(db, 'DELETE FROM surgeries').run();
      statement(db, 'DELETE FROM users WHERE username != ?').run('admin');
    });
    clearAll();
    try {
      db.exec('VACUUM');
    } catch (err) {
      console.warn('清空后压缩数据库失败:', err.message);
    }
    res.json({ success: true, message: '数据已清空（保留管理员账户）' });
  } catch (err) {
    return res.status(500).json({ error: '清空数据失败: ' + err.message });
  }
});

module.exports = router;
