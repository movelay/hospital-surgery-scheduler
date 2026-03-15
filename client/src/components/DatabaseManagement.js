import React, { useState, useEffect, useRef } from 'react';
import { databaseAPI } from '../services/api';
import '../styles/DatabaseManagement.css';

const DatabaseManagement = ({ onClose }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await databaseAPI.getStats();
      setStats(response.data);
    } catch (error) {
      console.error('获取数据库统计失败:', error);
      setMessage({ type: 'error', text: '获取数据库统计失败' });
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleBackup = async (full = false) => {
    try {
      setOperating(true);
      setMessage(null);
      
      const response = full 
        ? await databaseAPI.backupFull()
        : await databaseAPI.backup();
      
      // 创建下载
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hospital_${full ? 'full_' : ''}backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setMessage({ type: 'success', text: '数据库备份已下载' });
    } catch (error) {
      console.error('备份失败:', error);
      setMessage({ type: 'error', text: error.response?.data?.error || '备份失败' });
    } finally {
      setOperating(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backup = JSON.parse(event.target.result);
        
        if (!backup.data || (!backup.data.users && !backup.data.surgeries)) {
          setMessage({ type: 'error', text: '无效的备份文件格式' });
          return;
        }
        
        // 显示确认对话框
        const mode = window.confirm(
          '请选择恢复模式：\n\n' +
          '点击"确定"：替换模式 - 清空现有数据后导入\n' +
          '点击"取消"：合并模式 - 保留现有数据，合并导入'
        ) ? 'replace' : 'merge';
        
        if (mode === 'replace') {
          const confirmed = window.confirm(
            '⚠️ 警告：替换模式将删除所有现有数据！\n\n确定要继续吗？'
          );
          if (!confirmed) return;
        }
        
        setOperating(true);
        setMessage(null);
        
        const response = await databaseAPI.restore(backup, mode);
        
        setMessage({ 
          type: 'success', 
          text: `恢复完成！导入了 ${response.data.stats.usersImported} 个用户和 ${response.data.stats.surgeriesImported} 条手术记录` 
        });
        
        fetchStats();
      } catch (error) {
        console.error('恢复失败:', error);
        setMessage({ type: 'error', text: error.response?.data?.error || '恢复失败，请检查备份文件格式' });
      } finally {
        setOperating(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleClear = async () => {
    const confirmed = window.confirm(
      '⚠️ 危险操作！\n\n' +
      '这将删除所有手术记录和非管理员用户！\n' +
      '此操作无法撤销！\n\n' +
      '确定要继续吗？'
    );
    
    if (!confirmed) return;
    
    const doubleConfirm = window.prompt(
      '请输入 "CONFIRM" 确认清空数据库：'
    );
    
    if (doubleConfirm !== 'CONFIRM') {
      setMessage({ type: 'error', text: '操作已取消' });
      return;
    }
    
    try {
      setOperating(true);
      setMessage(null);
      
      await databaseAPI.clear('CONFIRM_CLEAR_ALL_DATA');
      
      setMessage({ type: 'success', text: '数据库已清空' });
      fetchStats();
    } catch (error) {
      console.error('清空失败:', error);
      setMessage({ type: 'error', text: error.response?.data?.error || '清空失败' });
    } finally {
      setOperating(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="database-management">
        <div className="modal-header">
          <h2>📊 数据库管理</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {message && (
            <div className={`message ${message.type}`}>
              {message.type === 'success' ? '✅' : '❌'} {message.text}
            </div>
          )}
          
          {loading ? (
            <div className="loading">加载中...</div>
          ) : (
            <>
              {/* 数据库统计 */}
              <div className="section">
                <h3>📈 数据库统计</h3>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{stats?.userCount || 0}</div>
                    <div className="stat-label">用户数量</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{stats?.surgeryCount || 0}</div>
                    <div className="stat-label">手术记录</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{stats?.completedSurgeryCount || 0}</div>
                    <div className="stat-label">已完成手术</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{formatBytes(stats?.dbSize || 0)}</div>
                    <div className="stat-label">数据库大小</div>
                  </div>
                </div>
              </div>
              
              {/* 备份功能 */}
              <div className="section">
                <h3>💾 数据备份</h3>
                <p className="section-desc">导出数据库备份文件，用于数据迁移或恢复</p>
                <div className="button-group">
                  <button 
                    className="btn btn-primary"
                    onClick={() => handleBackup(false)}
                    disabled={operating}
                  >
                    📥 导出备份（不含密码）
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => handleBackup(true)}
                    disabled={operating}
                  >
                    📥 导出完整备份
                  </button>
                </div>
                <p className="hint">完整备份包含用户密码哈希，适用于完整数据迁移</p>
              </div>
              
              {/* 恢复功能 */}
              <div className="section">
                <h3>📤 数据恢复</h3>
                <p className="section-desc">从备份文件恢复数据</p>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button 
                  className="btn btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={operating}
                >
                  📂 选择备份文件并恢复
                </button>
                <p className="hint">支持合并模式（保留现有数据）和替换模式（清空后导入）</p>
              </div>
              
              {/* 危险操作 */}
              <div className="section danger-section">
                <h3>⚠️ 危险操作</h3>
                <p className="section-desc">以下操作不可撤销，请谨慎使用</p>
                <button 
                  className="btn btn-danger"
                  onClick={handleClear}
                  disabled={operating}
                >
                  🗑️ 清空数据库
                </button>
              </div>
            </>
          )}
        </div>
        
        {operating && (
          <div className="operating-overlay">
            <div className="spinner"></div>
            <p>处理中，请稍候...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseManagement;
