import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// 配置axios默认设置
axios.defaults.headers.common['Content-Type'] = 'application/json';

// 手术相关API
export const surgeryAPI = {
  getAll: (date, doctorId, operatingRoom, viewAll) => {
    const params = {};
    if (date) params.date = date;
    if (doctorId) params.doctor_id = doctorId;
    if (operatingRoom) params.operating_room = operatingRoom;
    if (viewAll) params.view_all = 'true';
    return axios.get(`${API_BASE_URL}/surgery`, { params });
  },
  getById: (id) => axios.get(`${API_BASE_URL}/surgery/${id}`),
  create: (data) => axios.post(`${API_BASE_URL}/surgery`, data),
  update: (id, data) => axios.put(`${API_BASE_URL}/surgery/${id}`, data),
  delete: (id) => axios.delete(`${API_BASE_URL}/surgery/${id}`),
  getOperatingRooms: () => axios.get(`${API_BASE_URL}/surgery/operating-rooms`)
};

// 用户相关API（仅管理员）
export const userAPI = {
  getAll: () => axios.get(`${API_BASE_URL}/user`),
  create: (data) => axios.post(`${API_BASE_URL}/user`, data),
  update: (id, data) => axios.put(`${API_BASE_URL}/user/${id}`, data),
  delete: (id) => axios.delete(`${API_BASE_URL}/user/${id}`),
  getDoctors: () => axios.get(`${API_BASE_URL}/user/doctors`)
};

// 数据库管理API（仅管理员）
export const databaseAPI = {
  // 获取数据库统计信息
  getStats: () => axios.get(`${API_BASE_URL}/database/stats`),
  // 导出数据库备份
  backup: () => axios.get(`${API_BASE_URL}/database/backup`),
  // 导出完整数据库备份（包含密码）
  backupFull: () => axios.get(`${API_BASE_URL}/database/backup/full`),
  // 恢复数据库
  restore: (backup, mode = 'merge') => axios.post(`${API_BASE_URL}/database/restore`, { backup, mode }),
  // 清空数据库
  clear: (confirm) => axios.post(`${API_BASE_URL}/database/clear`, { confirm })
};
