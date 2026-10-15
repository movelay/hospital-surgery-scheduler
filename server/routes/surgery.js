const express = require('express');
const { getDatabase } = require('../database/init');
const { statement } = require('../database/statements');
const { findConflict } = require('../database/conflicts');
const { authenticateToken } = require('../middleware/auth');
const {
  STATUSES,
  httpError,
  sendRouteError,
  normalizeDate,
  normalizeTime
} = require('../utils/schedule');

const router = express.Router();

const SURGERY_FROM = `
  SELECT s.id, s.doctor_id,
         COALESCE(u.name, s.doctor_name) AS doctor_name,
         s.patient_name, s.surgery_type, s.surgery_date,
         s.start_time, s.end_time, s.operating_room,
         s.status, s.notes, s.created_at, s.updated_at
  FROM surgeries s
  LEFT JOIN users u ON u.id = s.doctor_id
`;

router.use(authenticateToken);

function requireDate(value, label) {
  if (value === undefined || value === null || value === '') {
    throw httpError(400, `请填写${label}`);
  }
  const normalized = normalizeDate(value);
  if (!normalized) throw httpError(400, `${label}格式无效`);
  return normalized;
}

function requireTime(value, label) {
  if (value === undefined || value === null || value === '') {
    throw httpError(400, `请填写${label}`);
  }
  const normalized = normalizeTime(value);
  if (!normalized) throw httpError(400, `${label}格式无效`);
  return normalized;
}

function requireText(value, label, maxLength) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw httpError(400, `请填写${label}`);
  }
  const text = String(value).trim();
  if (text.length > maxLength) throw httpError(400, `${label}过长`);
  return text;
}

function optionalDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = normalizeDate(value);
  if (!normalized) throw httpError(400, `${label}格式无效`);
  return normalized;
}

function optionalTime(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = normalizeTime(value);
  if (!normalized) throw httpError(400, `${label}格式无效`);
  return normalized;
}

function assertNoConflict(db, slot) {
  if (findConflict(db, slot)) {
    throw httpError(400, '该手术室在该时间段已被占用');
  }
}

router.get('/', (req, res) => {
  const { date, date_from, date_to, doctor_id, operating_room } = req.query;
  const db = getDatabase();
  const where = [];
  const params = [];

  try {
    if (date) {
      where.push('s.surgery_date = ?');
      params.push(requireDate(date, '日期'));
    } else {
      const from = optionalDate(date_from, '开始日期');
      const to = optionalDate(date_to, '结束日期');
      if (from) {
        where.push('s.surgery_date >= ?');
        params.push(from);
      }
      if (to) {
        where.push('s.surgery_date <= ?');
        params.push(to);
      }
    }

    if (req.user.role === 'doctor') {
      if (req.query.view_all !== 'true') {
        where.push('s.doctor_id = ?');
        params.push(req.user.id);
      }
    } else if (req.user.role === 'admin' && doctor_id) {
      where.push('s.doctor_id = ?');
      params.push(doctor_id);
    }

    if (typeof operating_room === 'string' && operating_room.trim() !== '') {
      where.push('s.operating_room = ?');
      params.push(operating_room.trim());
    }

    const sql = `${SURGERY_FROM}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY s.surgery_date, s.start_time`;
    res.json(statement(db, sql).all(...params));
  } catch (err) {
    return sendRouteError(res, err, '查询手术失败');
  }
});

router.get('/operating-rooms', (req, res) => {
  const db = getDatabase();
  try {
    const rooms = statement(
      db,
      'SELECT DISTINCT operating_room FROM surgeries ORDER BY operating_room'
    ).all();
    res.json(rooms.map(room => room.operating_room));
  } catch (err) {
    return sendRouteError(res, err, '查询手术室列表失败');
  }
});

router.get('/:id', (req, res) => {
  const db = getDatabase();
  const where = ['s.id = ?'];
  const params = [req.params.id];

  if (req.user.role === 'doctor') {
    where.push('s.doctor_id = ?');
    params.push(req.user.id);
  }

  try {
    const surgery = statement(db, `${SURGERY_FROM} WHERE ${where.join(' AND ')}`).get(...params);
    if (!surgery) {
      return res.status(404).json({ error: '手术不存在或无权限访问' });
    }
    res.json(surgery);
  } catch (err) {
    return sendRouteError(res, err, '查询手术失败');
  }
});

router.post('/', (req, res) => {
  const db = getDatabase();

  try {
    const patientName = requireText(req.body.patient_name, '病人姓名', 100);
    const surgeryType = requireText(req.body.surgery_type, '手术项目', 100);
    const surgeryDate = requireDate(req.body.surgery_date, '手术日期');
    const startTime = requireTime(req.body.start_time, '开始时间');
    const endTime = requireTime(req.body.end_time, '结束时间');
    const operatingRoom = requireText(req.body.operating_room, '手术室', 50);
    const notes = req.body.notes == null ? '' : String(req.body.notes).slice(0, 2000);

    if (startTime >= endTime) {
      throw httpError(400, '开始时间必须早于结束时间');
    }

    const requestedDoctorId = req.user.role === 'admin' && req.body.doctor_id
      ? req.body.doctor_id
      : req.user.id;

    const surgery = db.transaction(() => {
      assertNoConflict(db, {
        room: operatingRoom,
        date: surgeryDate,
        start: startTime,
        end: endTime
      });

      const doctor = statement(db, 'SELECT id, name FROM users WHERE id = ?').get(requestedDoctorId);
      if (!doctor) throw httpError(404, '医生不存在');

      const result = statement(
        db,
        `INSERT INTO surgeries
         (doctor_id, doctor_name, patient_name, surgery_type, surgery_date, start_time, end_time, operating_room, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        doctor.id,
        doctor.name,
        patientName,
        surgeryType,
        surgeryDate,
        startTime,
        endTime,
        operatingRoom,
        notes
      );

      return statement(db, `${SURGERY_FROM} WHERE s.id = ?`).get(result.lastInsertRowid);
    })();

    res.status(201).json(surgery);
  } catch (err) {
    return sendRouteError(res, err, '创建手术失败');
  }
});

router.put('/:id', (req, res) => {
  const db = getDatabase();

  try {
    const surgery = db.transaction(() => {
      const where = ['s.id = ?'];
      const params = [req.params.id];
      if (req.user.role === 'doctor') {
        where.push('s.doctor_id = ?');
        params.push(req.user.id);
      }

      const existing = statement(db, `${SURGERY_FROM} WHERE ${where.join(' AND ')}`).get(...params);
      if (!existing) throw httpError(404, '手术不存在或无权限修改');

      const patientName = req.body.patient_name !== undefined
        ? requireText(req.body.patient_name, '病人姓名', 100)
        : null;
      const surgeryType = req.body.surgery_type !== undefined
        ? requireText(req.body.surgery_type, '手术项目', 100)
        : null;
      const surgeryDate = optionalDate(req.body.surgery_date, '手术日期');
      const startTime = optionalTime(req.body.start_time, '开始时间');
      const endTime = optionalTime(req.body.end_time, '结束时间');
      const operatingRoom = req.body.operating_room !== undefined
        ? requireText(req.body.operating_room, '手术室', 50)
        : null;

      const effectiveStart = startTime || existing.start_time;
      const effectiveEnd = endTime || existing.end_time;
      if (effectiveStart >= effectiveEnd) {
        throw httpError(400, '开始时间必须早于结束时间');
      }

      let nextStatus = existing.status;
      if (req.body.status !== undefined && req.body.status !== existing.status) {
        if (req.user.role !== 'admin') {
          throw httpError(403, '只有管理员可以修改手术状态');
        }
        if (!STATUSES.has(req.body.status)) {
          throw httpError(400, '无效的手术状态');
        }
        nextStatus = req.body.status;
      }

      const effectiveDate = surgeryDate || existing.surgery_date;
      const effectiveRoom = operatingRoom || existing.operating_room;
      const slotChanged = effectiveDate !== existing.surgery_date
        || effectiveStart !== existing.start_time
        || effectiveEnd !== existing.end_time
        || effectiveRoom !== existing.operating_room;
      const reactivating = existing.status === 'cancelled' && nextStatus !== 'cancelled';

      if (nextStatus !== 'cancelled' && (slotChanged || reactivating)) {
        assertNoConflict(db, {
          room: effectiveRoom,
          date: effectiveDate,
          start: effectiveStart,
          end: effectiveEnd,
          excludeId: existing.id
        });
      }

      const updateFields = [];
      const updateValues = [];

      if (req.user.role === 'admin' && req.body.doctor_id && Number(req.body.doctor_id) !== existing.doctor_id) {
        const doctor = statement(db, 'SELECT id, name FROM users WHERE id = ?').get(req.body.doctor_id);
        if (!doctor) throw httpError(404, '医生不存在');
        updateFields.push('doctor_id = ?', 'doctor_name = ?');
        updateValues.push(doctor.id, doctor.name);
      }
      if (patientName) {
        updateFields.push('patient_name = ?');
        updateValues.push(patientName);
      }
      if (surgeryType) {
        updateFields.push('surgery_type = ?');
        updateValues.push(surgeryType);
      }
      if (surgeryDate) {
        updateFields.push('surgery_date = ?');
        updateValues.push(surgeryDate);
      }
      if (startTime) {
        updateFields.push('start_time = ?');
        updateValues.push(startTime);
      }
      if (endTime) {
        updateFields.push('end_time = ?');
        updateValues.push(endTime);
      }
      if (operatingRoom) {
        updateFields.push('operating_room = ?');
        updateValues.push(operatingRoom);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
        updateFields.push('notes = ?');
        updateValues.push(req.body.notes == null ? '' : String(req.body.notes).slice(0, 2000));
      }
      if (nextStatus !== existing.status) {
        updateFields.push('status = ?');
        updateValues.push(nextStatus);
      }

      if (updateFields.length === 0) {
        throw httpError(400, '没有要更新的字段');
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(existing.id);
      statement(db, `UPDATE surgeries SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateValues);

      return statement(db, `${SURGERY_FROM} WHERE s.id = ?`).get(existing.id);
    })();

    res.json(surgery);
  } catch (err) {
    return sendRouteError(res, err, '更新手术失败');
  }
});

router.delete('/:id', (req, res) => {
  const db = getDatabase();
  let sql = 'DELETE FROM surgeries WHERE id = ?';
  const params = [req.params.id];

  if (req.user.role === 'doctor') {
    sql += ' AND doctor_id = ?';
    params.push(req.user.id);
  }

  try {
    const result = statement(db, sql).run(...params);
    if (result.changes === 0) {
      return res.status(404).json({ error: '手术不存在或无权限删除' });
    }
    res.json({ message: '手术已删除' });
  } catch (err) {
    return sendRouteError(res, err, '删除手术失败');
  }
});

module.exports = router;
