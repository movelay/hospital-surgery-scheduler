import React, { useState, useEffect } from 'react';
import { userAPI } from '../services/api';
import '../styles/UserManagement.css';

const UserManagement = ({ onClose }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    role: 'doctor'
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await userAPI.getAll();
      setUsers(response.data);
    } catch (error) {
      console.error('获取用户列表失败:', error);
      alert('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setFormData({ username: '', password: '', name: '', role: 'doctor' });
    setEditingUser(null);
    setShowForm(true);
  };

  const handleEdit = (user) => {
    setFormData({ username: user.username, password: '', name: user.name, role: user.role });
    setEditingUser(user);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个用户吗？')) {
      return;
    }

    try {
      await userAPI.delete(id);
      fetchUsers();
      alert('删除成功');
    } catch (error) {
      alert(error.response?.data?.error || '删除失败');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await userAPI.update(editingUser.id, formData);
      } else {
        await userAPI.create(formData);
      }
      setShowForm(false);
      fetchUsers();
      alert(editingUser ? '更新成功' : '创建成功');
    } catch (error) {
      alert(error.response?.data?.error || '操作失败');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content user-management" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>用户管理</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="user-management-content">
          <button onClick={handleCreate} className="create-button">
            新增用户
          </button>

          {loading ? (
            <div className="loading">加载中...</div>
          ) : (
            <table className="user-table">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>姓名</th>
                  <th>角色</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.name}</td>
                    <td>{user.role === 'admin' ? '管理员' : '医生'}</td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td>
                      <button
                        onClick={() => handleEdit(user)}
                        className="edit-button"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="delete-button"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showForm && (
          <div className="user-form-overlay">
            <div className="user-form" onClick={(e) => e.stopPropagation()}>
              <h3>{editingUser ? '编辑用户' : '新增用户'}</h3>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>用户名 *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                    disabled={!!editingUser}
                  />
                </div>
                <div className="form-group">
                  <label>密码 {editingUser ? '(留空则不修改)' : '*'}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                  />
                </div>
                <div className="form-group">
                  <label>姓名 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>角色 *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    required
                  >
                    <option value="doctor">医生</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>
                <div className="form-actions">
                  <button type="button" onClick={() => setShowForm(false)} className="cancel-button">
                    取消
                  </button>
                  <button type="submit" className="submit-button">保存</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;
