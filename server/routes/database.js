const express = require('express');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// 所有数据库路由都需要管理员权限
router.use(authenticateToken);
router.use(requireAdmin);

// 获取数据库统计信息
router.get('/stats', (req, res) => {
  const db = getDatabase();
  
  const stats = {};
  
  db.get('SELECT COUNT(*) as count FROM users', (err, result) => {
    if (err) {
      return res.status(500).json({ error: '获取统计信息失败: ' + err.message });
    }
    stats.userCount = result.count;
    
    db.get('SELECT COUNT(*) as count FROM surgeries', (err, result) => {
      if (err) {
        return res.status(500).json({ error: '获取统计信息失败: ' + err.message });
      }
      stats.surgeryCount = result.count;
      
      db.get('SELECT COUNT(*) as count FROM surgeries WHERE status = "completed"', (err, result) => {
        if (err) {
          return res.status(500).json({ error: '获取统计信息失败: ' + err.message });
        }
        stats.completedSurgeryCount = result.count;
        
        // 获取数据库文件大小
        const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/hospital.db');
        try {
          const stat = fs.statSync(dbPath);
          stats.dbSize = stat.size;
          stats.dbPath = dbPath;
        } catch (e) {
          stats.dbSize = 0;
          stats.dbPath = dbPath;
        }
        
        res.json(stats);
      });
    });
  });
});

// 导出数据库（备份）
router.get('/backup', (req, res) => {
  const db = getDatabase();
  
  const backup = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    data: {
      users: [],
      surgeries: []
    }
  };
  
  // 导出用户数据（不包含密码）
  db.all('SELECT id, username, name, role, created_at FROM users', (err, users) => {
    if (err) {
      return res.status(500).json({ error: '导出用户数据失败: ' + err.message });
    }
    backup.data.users = users;
    
    // 导出手术数据
    db.all('SELECT * FROM surgeries', (err, surgeries) => {
      if (err) {
        return res.status(500).json({ error: '导出手术数据失败: ' + err.message });
      }
      backup.data.surgeries = surgeries;
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=hospital_backup_${new Date().toISOString().split('T')[0]}.json`);
      res.json(backup);
    });
  });
});

// 导出完整数据库（包含密码，用于完整迁移）
router.get('/backup/full', (req, res) => {
  const db = getDatabase();
  
  const backup = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    type: 'full',
    data: {
      users: [],
      surgeries: []
    }
  };
  
  // 导出完整用户数据（包含密码哈希）
  db.all('SELECT * FROM users', (err, users) => {
    if (err) {
      return res.status(500).json({ error: '导出用户数据失败: ' + err.message });
    }
    backup.data.users = users;
    
    // 导出手术数据
    db.all('SELECT * FROM surgeries', (err, surgeries) => {
      if (err) {
        return res.status(500).json({ error: '导出手术数据失败: ' + err.message });
      }
      backup.data.surgeries = surgeries;
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=hospital_full_backup_${new Date().toISOString().split('T')[0]}.json`);
      res.json(backup);
    });
  });
});

// 导入数据库（恢复）
router.post('/restore', (req, res) => {
  const { backup, mode } = req.body;
  
  if (!backup || !backup.data) {
    return res.status(400).json({ error: '无效的备份数据' });
  }
  
  const db = getDatabase();
  
  // mode: 'merge' - 合并数据, 'replace' - 替换所有数据
  const replaceMode = mode === 'replace';
  
  const stats = {
    userImportCount: 0,
    userSkipCount: 0,
    surgeryImportCount: 0,
    surgerySkipCount: 0,
    errors: []
  };

  const runClear = () => {
    return new Promise((resolve, reject) => {
      if (!replaceMode) return resolve();
      db.run('DELETE FROM surgeries', (err) => {
        if (err) return reject(err);
        db.run('DELETE FROM users WHERE username != "admin"', (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  };

  const runUserImport = (user) => {
    return new Promise((resolve) => {
      if (user.username === 'admin') return resolve();
      const password = backup.type === 'full' && user.password
        ? user.password
        : bcrypt.hashSync('changeme123', 10);
      if (!replaceMode) {
        db.get('SELECT id FROM users WHERE username = ?', [user.username], (err, existing) => {
          if (existing) {
            stats.userSkipCount++;
            return resolve();
          }
          db.run(
            'INSERT INTO users (username, password, name, role, created_at) VALUES (?, ?, ?, ?, ?)',
            [user.username, password, user.name, user.role || 'doctor', user.created_at || new Date().toISOString()],
            (err) => {
              if (err) stats.errors.push(`导入用户 ${user.username} 失败: ${err.message}`);
              else stats.userImportCount++;
              resolve();
            }
          );
        });
      } else {
        db.run(
          'INSERT INTO users (id, username, password, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, user.username, password, user.name, user.role || 'doctor', user.created_at || new Date().toISOString()],
          (err) => {
            if (err) stats.errors.push(`导入用户 ${user.username} 失败: ${err.message}`);
            else stats.userImportCount++;
            resolve();
          }
        );
      }
    });
  };

  const runSurgeryImport = (surgery) => {
    return new Promise((resolve) => {
      if (!replaceMode) {
        db.get(
          `SELECT id FROM surgeries 
           WHERE operating_room = ? AND surgery_date = ? 
           AND start_time = ? AND end_time = ? AND patient_name = ?`,
          [surgery.operating_room, surgery.surgery_date, surgery.start_time, surgery.end_time, surgery.patient_name],
          (err, existing) => {
            if (existing) {
              stats.surgerySkipCount++;
              return resolve();
            }
            db.get(
              `SELECT id FROM surgeries 
               WHERE operating_room = ? AND surgery_date = ? 
               AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?) OR (start_time >= ? AND end_time <= ?))`,
              [surgery.operating_room, surgery.surgery_date,
                surgery.start_time, surgery.start_time, surgery.end_time, surgery.end_time,
                surgery.start_time, surgery.end_time],
              (err, conflict) => {
                if (conflict) {
                  stats.surgerySkipCount++;
                  stats.errors.push(`手术 ${surgery.patient_name} (${surgery.surgery_date} ${surgery.start_time}) 与现有手术冲突，已跳过`);
                  return resolve();
                }
                db.run(
                  `INSERT INTO surgeries 
                   (doctor_id, doctor_name, patient_name, surgery_type, surgery_date, 
                    start_time, end_time, operating_room, status, notes, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [surgery.doctor_id, surgery.doctor_name, surgery.patient_name, surgery.surgery_type,
                    surgery.surgery_date, surgery.start_time, surgery.end_time, surgery.operating_room,
                    surgery.status || 'scheduled', surgery.notes || '',
                    surgery.created_at || new Date().toISOString(), surgery.updated_at || new Date().toISOString()],
                  (err) => {
                    if (err) stats.errors.push(`导入手术 ${surgery.patient_name} 失败: ${err.message}`);
                    else stats.surgeryImportCount++;
                    resolve();
                  }
                );
              }
            );
          }
        );
      } else {
        db.run(
          `INSERT INTO surgeries 
           (id, doctor_id, doctor_name, patient_name, surgery_type, surgery_date, 
            start_time, end_time, operating_room, status, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [surgery.id, surgery.doctor_id, surgery.doctor_name, surgery.patient_name, surgery.surgery_type,
            surgery.surgery_date, surgery.start_time, surgery.end_time, surgery.operating_room,
            surgery.status || 'scheduled', surgery.notes || '',
            surgery.created_at || new Date().toISOString(), surgery.updated_at || new Date().toISOString()],
          (err) => {
            if (err) stats.errors.push(`导入手术 ${surgery.patient_name} 失败: ${err.message}`);
            else stats.surgeryImportCount++;
            resolve();
          }
        );
      }
    });
  };

  const processRestore = async () => {
    await runClear();
    const users = (backup.data.users || []).filter(u => u.username !== 'admin');
    const surgeries = backup.data.surgeries || [];
    for (const user of users) {
      await runUserImport(user);
    }
    for (const surgery of surgeries) {
      await runSurgeryImport(surgery);
    }
    return stats;
  };

  processRestore()
    .then((result) => {
      res.json({
        success: true,
        message: '数据导入完成',
        stats: {
          usersImported: result.userImportCount,
          usersSkipped: result.userSkipCount,
          surgeriesImported: result.surgeryImportCount,
          surgeriesSkipped: result.surgerySkipCount,
          errors: result.errors
        }
      });
    })
    .catch(err => {
      res.status(500).json({ error: '导入失败: ' + err.message });
    });
});

// 清空数据库（危险操作）
router.post('/clear', (req, res) => {
  const { confirm } = req.body;
  
  if (confirm !== 'CONFIRM_CLEAR_ALL_DATA') {
    return res.status(400).json({ error: '请确认清空操作' });
  }
  
  const db = getDatabase();
  
  db.serialize(() => {
    db.run('DELETE FROM surgeries', (err) => {
      if (err) {
        return res.status(500).json({ error: '清空手术数据失败: ' + err.message });
      }
      
      db.run('DELETE FROM users WHERE username != "admin"', (err) => {
        if (err) {
          return res.status(500).json({ error: '清空用户数据失败: ' + err.message });
        }
        
        res.json({ 
          success: true, 
          message: '数据已清空（保留管理员账户）' 
        });
      });
    });
  });
});

module.exports = router;
