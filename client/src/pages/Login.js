import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import '../styles/Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    setLoading(false);

    if (result.success && result.user) {
      // 根据用户角色导航到不同页面
      navigate(result.user.role === 'admin' ? '/admin' : '/dashboard');
    } else {
      setError(result.error || '登录失败');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>医院手术排班系统</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading} className="login-button">
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        <div className="login-hint">
          <p>默认管理员账户：admin / admin123</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
