const express = require('express');
const cors = require('cors');
const compression = require('compression');
const bodyParser = require('body-parser');
const path = require('path');

try {
  require('dotenv').config();
} catch (e) {
  // dotenv 未配置，跳过
}

const authRoutes = require('./routes/auth');
const surgeryRoutes = require('./routes/surgery');
const userRoutes = require('./routes/user');
const databaseRoutes = require('./routes/database');
const { initDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const staticPath = process.env.STATIC_PATH || path.join(__dirname, '../client/build');
const jsonParser = bodyParser.json({ limit: '1mb' });
const urlencodedParser = bodyParser.urlencoded({ extended: true, limit: '1mb' });

// 中间件。恢复备份可能携带完整数据库，单独放宽限制。
app.use(compression());
app.use(cors());
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/database/restore') {
    return next();
  }
  jsonParser(req, res, (err) => {
    if (err) return next(err);
    urlencodedParser(req, res, next);
  });
});

// 静态文件服务（用于生产环境）
if (isProduction) {
  console.log('静态文件目录:', staticPath);
  app.use(express.static(staticPath, {
    index: false,
    setHeaders(res, filePath) {
      const base = path.basename(filePath);
      if (base === 'index.html' || base === 'sw.js' || base === 'manifest.json' || base === 'asset-manifest.json') {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes(`${path.sep}static${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
}

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/surgery', surgeryRoutes);
app.use('/api/user', userRoutes);
app.use('/api/database', databaseRoutes);

app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: '请求体过大' });
  }
  return next(err);
});

// 生产环境：所有非API请求返回React应用
if (isProduction) {
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

// 获取本机 IP 地址
function getLocalIPAddress() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 跳过内部（即 127.0.0.1）和非 IPv4 地址
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// 初始化数据库
initDatabase().then(() => {
  // 监听所有网络接口 (0.0.0.0)，允许内网访问
  const server = app.listen(PORT, '0.0.0.0', () => {
    const address = server.address();
    const actualPort = address && address.port ? address.port : PORT;
    const localIP = getLocalIPAddress();
    console.log(`服务器运行在端口 ${actualPort}`);
    console.log(`本地访问: http://localhost:${actualPort}`);
    console.log(`内网访问: http://${localIP}:${actualPort}`);
    console.log(`内网设备可通过以上地址访问服务`);
  });
  
  // 导出 server 以便外部可以关闭
  module.exports.server = server;
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});

module.exports = app;
