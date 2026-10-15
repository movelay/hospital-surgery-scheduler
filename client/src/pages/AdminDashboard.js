import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../services/AuthContext';
import { surgeryAPI, isCanceled } from '../services/api';
import { localDateString } from '../utils/date';
import SurgeryList from '../components/SurgeryList';
import '../styles/Dashboard.css';

const SurgeryForm = lazy(() => import('../components/SurgeryForm'));
const UserManagement = lazy(() => import('../components/UserManagement'));
const DatabaseManagement = lazy(() => import('../components/DatabaseManagement'));

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showDatabaseManagement, setShowDatabaseManagement] = useState(false);
  const [editingSurgery, setEditingSurgery] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => localDateString());
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const hasLoadedRef = useRef(false);
  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (user?.role !== 'admin') return undefined;
    const controller = new AbortController();
    let active = true;

    const load = async () => {
      try {
        if (hasLoadedRef.current) setRefreshing(true);
        else setLoading(true);
        const response = await surgeryAPI.getAll(selectedDate, null, null, false, null, null, controller.signal);
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
  }, [selectedDate, user, reloadKey]);

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
          <h1>手术排班管理 - 管理员</h1>
          <p>欢迎，{user?.name}</p>
        </div>
        <div className="header-actions">
          <button
            onClick={() => setShowUserManagement(true)}
            className="admin-button"
          >
            👥 用户管理
          </button>
          <button
            onClick={() => setShowDatabaseManagement(true)}
            className="admin-button"
          >
            📊 数据库管理
          </button>
          <button onClick={logout} className="logout-button">退出登录</button>
        </div>
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
          <button onClick={handleCreate} className="create-button">
            新增手术
          </button>
        </div>

        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          <SurgeryList
            surgeries={surgeries}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isAdmin={true}
          />
        )}
      </div>

      {showForm && (
        <Suspense fallback={<div className="loading">加载中...</div>}>
          <SurgeryForm
            surgery={editingSurgery}
            onClose={handleFormClose}
            onSuccess={handleFormSuccess}
            isAdmin={true}
          />
        </Suspense>
      )}

      {showUserManagement && (
        <Suspense fallback={<div className="loading">加载中...</div>}>
          <UserManagement
            onClose={() => setShowUserManagement(false)}
          />
        </Suspense>
      )}

      {showDatabaseManagement && (
        <Suspense fallback={<div className="loading">加载中...</div>}>
          <DatabaseManagement
            onClose={() => setShowDatabaseManagement(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default AdminDashboard;
