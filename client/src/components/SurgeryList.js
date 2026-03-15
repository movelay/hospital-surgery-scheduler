import React from 'react';
import '../styles/SurgeryList.css';

const SurgeryList = ({ surgeries, onEdit, onDelete, isAdmin = false }) => {
  if (surgeries.length === 0) {
    return <div className="empty-state">暂无手术安排</div>;
  }

  return (
    <div className="surgery-list">
      <table>
        <thead>
          <tr>
            <th>手术日期</th>
            <th>时间</th>
            <th>手术室</th>
            <th>医生</th>
            <th>病人</th>
            <th>手术项目</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {surgeries.map((surgery) => (
            <tr key={surgery.id}>
              <td>{surgery.surgery_date}</td>
              <td>
                {surgery.start_time} - {surgery.end_time}
              </td>
              <td>{surgery.operating_room}</td>
              <td>{surgery.doctor_name}</td>
              <td>{surgery.patient_name}</td>
              <td>{surgery.surgery_type}</td>
              <td>
                <span className={`status-badge status-${surgery.status}`}>
                  {surgery.status === 'scheduled' ? '已安排' : 
                   surgery.status === 'completed' ? '已完成' : 
                   surgery.status === 'cancelled' ? '已取消' : surgery.status}
                </span>
              </td>
              <td>
                <div className="action-buttons">
                  <button
                    onClick={() => onEdit(surgery)}
                    className="edit-button"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => onDelete(surgery.id)}
                    className="delete-button"
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SurgeryList;
