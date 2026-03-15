import React, { useState, useEffect } from 'react';
import { useAuth } from '../services/AuthContext';
import { surgeryAPI } from '../services/api';
import SurgeryList from '../components/SurgeryList';
import SurgeryForm from '../components/SurgeryForm';
import UserManagement from '../components/UserManagement';
import DatabaseManagement from '../components/DatabaseManagement';
import '../styles/Dashboard.css';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showDatabaseManagement, setShowDatabaseManagement] = useState(false);
  const [editingSurgery, setEditingSurgery] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchSurgeries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, user]);

  const fetchSurgeries = async () => {
    try {
      setLoading(true);
      const response = await surgeryAPI.getAll(selectedDate);
      setSurgeries(response.data);
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
        <SurgeryForm
          surgery={editingSurgery}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
          isAdmin={true}
        />
      )}

      {showUserManagement && (
        <UserManagement
          onClose={() => setShowUserManagement(false)}
        />
      )}

      {showDatabaseManagement && (
        <DatabaseManagement
          onClose={() => setShowDatabaseManagement(false)}
        />
      )}
    </div>
  );
};

export default AdminDashboard;
