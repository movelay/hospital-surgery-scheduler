const { statement } = require('./statements');

// 已取消的手术不再占用手术室。相邻手术（前一台结束时刻等于后一台开始时刻）不算冲突。
const ACTIVE_OVERLAP = `
  operating_room = ?
  AND surgery_date = ?
  AND status != 'cancelled'
  AND start_time < ?
  AND end_time > ?
`;

function findConflict(db, { room, date, start, end, excludeId }) {
  if (excludeId !== undefined && excludeId !== null && excludeId !== '') {
    return statement(
      db,
      `SELECT id FROM surgeries WHERE id != ? AND ${ACTIVE_OVERLAP} LIMIT 1`
    ).get(excludeId, room, date, end, start);
  }
  return statement(
    db,
    `SELECT id FROM surgeries WHERE ${ACTIVE_OVERLAP} LIMIT 1`
  ).get(room, date, end, start);
}

module.exports = { findConflict };
