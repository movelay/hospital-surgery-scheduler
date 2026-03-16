const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 所有手术路由都需要认证
router.use(authenticateToken);

// 获取所有手术（可按日期、医生、手术室筛选）
router.get('/', (req, res) => {
  const { date, doctor_id, operating_room } = req.query;
  const db = getDatabase();
  let sql = 'SELECT * FROM surgeries WHERE 1=1';
  let params = [];

  if (date) {
    sql += ' AND surgery_date = ?';
    params.push(date);
  }

  if (req.user.role === 'doctor') {
    const viewAll = req.query.view_all === 'true';
    if (!viewAll) {
      sql += ' AND doctor_id = ?';
      params.push(req.user.id);
    }
  } else if (req.user.role === 'admin' && doctor_id) {
    sql += ' AND doctor_id = ?';
    params.push(doctor_id);
  }

  if (operating_room) {
    sql += ' AND operating_room = ?';
    params.push(operating_room);
  }

  sql += ' ORDER BY surgery_date, start_time';

  try {
    const surgeries = db.prepare(sql).all(...params);
    res.json(surgeries || []);
  } catch (err) {
    console.error('查询手术失败:', err);
    return res.status(500).json({ error: '查询手术失败: ' + err.message });
  }
});

// 获取所有手术室列表
router.get('/operating-rooms', (req, res) => {
  const db = getDatabase();
  try {
    const rooms = db.prepare('SELECT DISTINCT operating_room FROM surgeries ORDER BY operating_room').all();
    res.json(rooms.map(r => r.operating_room));
  } catch (err) {
    console.error('查询手术室列表失败:', err);
    return res.status(500).json({ error: '查询手术室列表失败: ' + err.message });
  }
});

// 获取单个手术详情
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();

  let sql = 'SELECT * FROM surgeries WHERE id = ?';
  let params = [id];

  if (req.user.role === 'doctor') {
    sql += ' AND doctor_id = ?';
    params.push(req.user.id);
  }

  try {
    const surgery = db.prepare(sql).get(...params);
    if (!surgery) {
      return res.status(404).json({ error: '手术不存在或无权限访问' });
    }
    res.json(surgery);
  } catch (err) {
    console.error('查询手术失败:', err);
    return res.status(500).json({ error: '查询手术失败: ' + err.message });
  }
});

// 创建手术
router.post('/', (req, res) => {
  const { doctor_id, patient_name, surgery_type, surgery_date, start_time, end_time, operating_room, notes } = req.body;

  if (!patient_name || !surgery_type || !surgery_date || !start_time || !end_time || !operating_room) {
    return res.status(400).json({ error: '请填写所有必填字段' });
  }

  if (start_time >= end_time) {
    return res.status(400).json({ error: '开始时间必须早于结束时间' });
  }

  const targetDoctorId = (doctor_id && req.user.role === 'admin') ? doctor_id : req.user.id;
  const db = getDatabase();

  try {
    const conflict = db.prepare(
      `SELECT * FROM surgeries 
       WHERE operating_room = ? AND surgery_date = ? 
       AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?) OR (start_time >= ? AND end_time <= ?))`
    ).get(operating_room, surgery_date, start_time, start_time, end_time, end_time, start_time, end_time);

    if (conflict) {
      return res.status(400).json({ error: '该手术室在该时间段已被占用' });
    }

    const doctor = db.prepare('SELECT name FROM users WHERE id = ?').get(targetDoctorId);
    if (!doctor) {
      return res.status(404).json({ error: '医生不存在' });
    }

    const result = db.prepare(
      `INSERT INTO surgeries 
       (doctor_id, doctor_name, patient_name, surgery_type, surgery_date, start_time, end_time, operating_room, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(targetDoctorId, doctor.name, patient_name, surgery_type, surgery_date, start_time, end_time, operating_room, notes || '');

    const surgery = db.prepare('SELECT * FROM surgeries WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(surgery);
  } catch (err) {
    console.error('创建手术失败:', err);
    return res.status(500).json({ error: '创建手术失败: ' + err.message });
  }
});

// 更新手术
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { doctor_id, patient_name, surgery_type, surgery_date, start_time, end_time, operating_room, notes, status } = req.body;

  const db = getDatabase();

  let checkSql = 'SELECT * FROM surgeries WHERE id = ?';
  let checkParams = [id];

  if (req.user.role === 'doctor') {
    checkSql += ' AND doctor_id = ?';
    checkParams.push(req.user.id);
  }

  try {
    const existingSurgery = db.prepare(checkSql).get(...checkParams);
    if (!existingSurgery) {
      return res.status(404).json({ error: '手术不存在或无权限修改' });
    }

    const effectiveStart = start_time || existingSurgery.start_time;
    const effectiveEnd = end_time || existingSurgery.end_time;
    if (effectiveStart >= effectiveEnd) {
      return res.status(400).json({ error: '开始时间必须早于结束时间' });
    }

    const dateChanged = surgery_date && surgery_date !== existingSurgery.surgery_date;
    const timeChanged = (start_time && start_time !== existingSurgery.start_time) || 
                        (end_time && end_time !== existingSurgery.end_time);
    const roomChanged = operating_room && operating_room !== existingSurgery.operating_room;

    if (dateChanged || timeChanged || roomChanged) {
      const checkDate = surgery_date || existingSurgery.surgery_date;
      const checkStart = start_time || existingSurgery.start_time;
      const checkEnd = end_time || existingSurgery.end_time;
      const checkRoom = operating_room || existingSurgery.operating_room;

      const conflict = db.prepare(
        `SELECT * FROM surgeries 
         WHERE id != ? AND operating_room = ? AND surgery_date = ? 
         AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?) OR (start_time >= ? AND end_time <= ?))`
      ).get(id, checkRoom, checkDate, checkStart, checkStart, checkEnd, checkEnd, checkStart, checkEnd);

      if (conflict) {
        return res.status(400).json({ error: '该手术室在该时间段已被占用' });
      }
    }

    let newDoctorName = null;
    if (doctor_id && req.user.role === 'admin' && parseInt(doctor_id) !== existingSurgery.doctor_id) {
      const newDoctor = db.prepare('SELECT name FROM users WHERE id = ?').get(doctor_id);
      if (!newDoctor) {
        return res.status(500).json({ error: '查询医生信息失败' });
      }
      newDoctorName = newDoctor.name;
    }

    const updateFields = [];
    const updateValues = [];

    if (doctor_id && req.user.role === 'admin' && parseInt(doctor_id) !== existingSurgery.doctor_id) {
      updateFields.push('doctor_id = ?');
      updateValues.push(doctor_id);
      if (newDoctorName) {
        updateFields.push('doctor_name = ?');
        updateValues.push(newDoctorName);
      }
    }
    if (patient_name) { updateFields.push('patient_name = ?'); updateValues.push(patient_name); }
    if (surgery_type) { updateFields.push('surgery_type = ?'); updateValues.push(surgery_type); }
    if (surgery_date) { updateFields.push('surgery_date = ?'); updateValues.push(surgery_date); }
    if (start_time) { updateFields.push('start_time = ?'); updateValues.push(start_time); }
    if (end_time) { updateFields.push('end_time = ?'); updateValues.push(end_time); }
    if (operating_room) { updateFields.push('operating_room = ?'); updateValues.push(operating_room); }
    if (notes !== undefined) { updateFields.push('notes = ?'); updateValues.push(notes); }
    if (status) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '只有管理员可以修改手术状态' });
      }
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);

    db.prepare(`UPDATE surgeries SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateValues);

    const surgery = db.prepare('SELECT * FROM surgeries WHERE id = ?').get(id);
    res.json(surgery);
  } catch (err) {
    console.error('更新手术失败:', err);
    return res.status(500).json({ error: '更新手术失败: ' + err.message });
  }
});

// 删除手术
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();

  let sql = 'DELETE FROM surgeries WHERE id = ?';
  let params = [id];

  if (req.user.role === 'doctor') {
    sql += ' AND doctor_id = ?';
    params.push(req.user.id);
  }

  try {
    const result = db.prepare(sql).run(...params);
    if (result.changes === 0) {
      return res.status(404).json({ error: '手术不存在或无权限删除' });
    }
    res.json({ message: '手术已删除' });
  } catch (err) {
    console.error('删除手术失败:', err);
    return res.status(500).json({ error: '删除手术失败: ' + err.message });
  }
});

module.exports = router;
