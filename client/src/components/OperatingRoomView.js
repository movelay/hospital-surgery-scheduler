import React, { useState, useEffect } from 'react';
import { surgeryAPI } from '../services/api';
import '../styles/OperatingRoomView.css';

const OperatingRoomView = ({ date, onClose }) => {
  const [rooms, setRooms] = useState([]);
  const [roomSurgeries, setRoomSurgeries] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState(null);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // 获取所有手术室
      const roomsResponse = await surgeryAPI.getOperatingRooms();
      const allRooms = roomsResponse.data;
      setRooms(allRooms);

      // 获取所有手术（不筛选日期，显示所有）
      const surgeriesResponse = await surgeryAPI.getAll(date, null, null, true);
      const allSurgeries = surgeriesResponse.data;

      // 按手术室分组
      const grouped = {};
      allSurgeries.forEach(surgery => {
        if (!grouped[surgery.operating_room]) {
          grouped[surgery.operating_room] = [];
        }
        grouped[surgery.operating_room].push(surgery);
      });
      setRoomSurgeries(grouped);

      if (allRooms.length > 0 && !selectedRoom) {
        setSelectedRoom(allRooms[0]);
      }
    } catch (error) {
      console.error('获取手术室数据失败:', error);
      alert('获取手术室数据失败');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time) => {
    return time || '';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content operating-room-view" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>手术室视图</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="room-view-content">
          {loading ? (
            <div className="loading">加载中...</div>
          ) : (
            <>
              <div className="room-selector">
                <label>选择手术室：</label>
                <select
                  value={selectedRoom || ''}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                >
                  <option value="">全部手术室</option>
                  {rooms.map(room => (
                    <option key={room} value={room}>{room}</option>
                  ))}
                </select>
              </div>

              <div className="rooms-grid">
                {(selectedRoom ? [selectedRoom] : rooms).map(room => {
                  const surgeries = roomSurgeries[room] || [];
                  return (
                    <div key={room} className="room-card">
                      <h3>{room}</h3>
                      {surgeries.length === 0 ? (
                        <div className="no-surgeries">暂无手术安排</div>
                      ) : (
                        <div className="surgeries-list">
                          {surgeries
                            .sort((a, b) => {
                              if (a.surgery_date !== b.surgery_date) {
                                return a.surgery_date.localeCompare(b.surgery_date);
                              }
                              return a.start_time.localeCompare(b.start_time);
                            })
                            .map(surgery => (
                              <div key={surgery.id} className="surgery-item">
                                <div className="surgery-date">{surgery.surgery_date}</div>
                                <div className="surgery-time">
                                  {formatTime(surgery.start_time)} - {formatTime(surgery.end_time)}
                                </div>
                                <div className="surgery-doctor">医生: {surgery.doctor_name}</div>
                                <div className="surgery-patient">病人: {surgery.patient_name}</div>
                                <div className="surgery-type">项目: {surgery.surgery_type}</div>
                                <div className={`surgery-status status-${surgery.status}`}>
                                  {surgery.status === 'scheduled' ? '已安排' : 
                                   surgery.status === 'completed' ? '已完成' : 
                                   surgery.status === 'cancelled' ? '已取消' : surgery.status}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OperatingRoomView;
