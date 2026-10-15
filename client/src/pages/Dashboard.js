import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../services/AuthContext';
import { surgeryAPI, isCanceled } from '../services/api';
import SurgeryList from '../components/SurgeryList';
import { localDateString } from '../utils/date';
import '../styles/Dashboard.css';

const SurgeryForm = lazy(() => import('../components/SurgeryForm'));
const OperatingRoomView = lazy(() => import('../components/OperatingRoomView'));

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showRoomView, setShowRoomView] = useState(false);
  const [editingSurgery, setEditingSurgery] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => localDateString());
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('my'); // 'my', 'all', 'by-doctor', 'by-room'
  const [reloadKey, setReloadKey] = useState(0);
  const hasLoadedRef = useRef(false);
  const viewAll = viewMode !== 'my';

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const load = async () => {
      try {
        if (hasLoadedRef.current) setRefreshing(true);
        else setLoading(true);
        const response = await surgeryAPI.getAll(selectedDate, null, null, viewAll, null, null, controller.signal);
        if (!active) return;
        setSurgeries(response.data);
        hasLoadedRef.current = true;
      } catch (error) {
        if (!active || isCanceled(error)) return;
        console.error('获取手术列表失败:', error);
        alert('获取手术列表失败');
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedDate, viewAll, reloadKey]);

  const groupedSurgeries = useMemo(() => {
    if (viewMode !== 'by-doctor' && viewMode !== 'by-room') return null;
    const grouped = {};
    surgeries.forEach(surgery => {
      const key = viewMode === 'by-doctor'
        ? `${surgery.doctor_name} (ID: ${surgery.doctor_id})`
        : surgery.operating_room;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(surgery);
    });
    return grouped;
  }, [surgeries, viewMode]);

  const handleCreate = useCallback(() => {
    setEditingSurgery(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((surgery) => {
    setEditingSurgery(surgery);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('确定要删除这台手术吗？')) {
      return;
    }

    try {
      await surgeryAPI.delete(id);
      refresh();
      alert('删除成功');
    } catch (error) {
      console.error('删除失败:', error);
      alert(error.response?.data?.error || '删除失败');
    }
  }, [refresh]);

  const handleFormClose = () => {
    setShowForm(false);
    setEditingSurgery(null);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingSurgery(null);
    refresh();
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
            {refreshing && <span className="toolbar-status">更新中...</span>}
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
        <Suspense fallback={<div className="loading">加载中...</div>}>
          <OperatingRoomView
            date={selectedDate}
            onClose={() => setShowRoomView(false)}
          />
        </Suspense>
      )}

      {showForm && (
        <Suspense fallback={<div className="loading">加载中...</div>}>
          <SurgeryForm
            surgery={editingSurgery}
            onClose={handleFormClose}
            onSuccess={handleFormSuccess}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Dashboard;
