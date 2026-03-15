import React, { useState, useEffect } from 'react';
import { useAuth } from '../services/AuthContext';
import { surgeryAPI } from '../services/api';
import SurgeryList from '../components/SurgeryList';
import SurgeryForm from '../components/SurgeryForm';
import OperatingRoomView from '../components/OperatingRoomView';
import '../styles/Dashboard.css';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showRoomView, setShowRoomView] = useState(false);
  const [editingSurgery, setEditingSurgery] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState('my'); // 'my', 'all', 'by-doctor', 'by-room'
  const [groupedSurgeries, setGroupedSurgeries] = useState({});

  useEffect(() => {
    fetchSurgeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, viewMode]);

  const fetchSurgeries = async () => {
    try {
      setLoading(true);
      const viewAll = viewMode !== 'my';
      const response = await surgeryAPI.getAll(selectedDate, null, null, viewAll);
      const allSurgeries = response.data;
      setSurgeries(allSurgeries);
      
      // 根据查看模式分组
      if (viewMode === 'by-doctor') {
        const grouped = {};
        allSurgeries.forEach(surgery => {
          const key = `${surgery.doctor_name} (ID: ${surgery.doctor_id})`;
          if (!grouped[key]) {
            grouped[key] = [];
          }
          grouped[key].push(surgery);
        });
        setGroupedSurgeries(grouped);
      } else if (viewMode === 'by-room') {
        const grouped = {};
        allSurgeries.forEach(surgery => {
          if (!grouped[surgery.operating_room]) {
            grouped[surgery.operating_room] = [];
          }
          grouped[surgery.operating_room].push(surgery);
        });
        setGroupedSurgeries(grouped);
      } else {
        setGroupedSurgeries({});
      }
    } catch (error) {
      console.error('获取手术列表失败:', error);
      alert('获取手术列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingSurgery(null);
    setShowForm(true);
  };

  const handleEdit = (surgery) => {
    setEditingSurgery(surgery);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这台手术吗？')) {
      return;
    }

    try {
      await surgeryAPI.delete(id);
      fetchSurgeries();
      alert('删除成功');
    } catch (error) {
      console.error('删除失败:', error);
      alert(error.response?.data?.error || '删除失败');
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingSurgery(null);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingSurgery(null);
    fetchSurgeries();
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>手术排班管理</h1>
          <p>欢迎，{user?.name}</p>
        </div>
        <button onClick={logout} className="logout-button">退出登录</button>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-toolbar">
          <div className="date-filter">
            <label>选择日期：</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className="view-mode-selector">
            <label>查看模式：</label>
            <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
              <option value="my">我的手术</option>
              <option value="all">所有手术</option>
              <option value="by-doctor">按医生分组</option>
              <option value="by-room">按手术室分组</option>
            </select>
          </div>
          <button onClick={() => setShowRoomView(true)} className="room-view-button">
            手术室视图
          </button>
          <button onClick={handleCreate} className="create-button">
            新增手术
          </button>
        </div>

        {loading ? (
          <div className="loading">加载中...</div>
        ) : viewMode === 'by-doctor' || viewMode === 'by-room' ? (
          <div className="grouped-view">
            {Object.keys(groupedSurgeries).length === 0 ? (
              <div className="empty-state">暂无手术安排</div>
            ) : (
              Object.keys(groupedSurgeries).map(key => (
                <div key={key} className="group-section">
                  <h3>{viewMode === 'by-doctor' ? '医生' : '手术室'}: {key}</h3>
                  <SurgeryList
                    surgeries={groupedSurgeries[key]}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                </div>
              ))
            )}
          </div>
        ) : (
          <SurgeryList
            surgeries={surgeries}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </div>

      {showRoomView && (
        <OperatingRoomView
          date={selectedDate}
          onClose={() => setShowRoomView(false)}
        />
      )}

      {showForm && (
        <SurgeryForm
          surgery={editingSurgery}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
};

export default Dashboard;
