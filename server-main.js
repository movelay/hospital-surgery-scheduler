const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

let mainWindow;
let tray;
let serverStarted = false;
let serverLogs = [];
let serverInstance = null;

// 判断是否为打包后的应用
const isDev = !app.isPackaged;

// 获取资源路径
function getResourcePath(relativePath) {
  if (isDev) {
    return path.join(__dirname, relativePath);
  }
  return path.join(process.resourcesPath, 'app.asar.unpacked', relativePath);
}

// 检查端口是否被占用
function checkPort(port) {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' 
      ? `netstat -ano | findstr :${port}`
      : `lsof -ti :${port}`;
    
    exec(command, (error, stdout, stderr) => {
      if (error || !stdout.trim()) {
        resolve(null); // 端口未被占用
      } else {
        // 提取进程 ID
        if (process.platform === 'win32') {
          const lines = stdout.trim().split('\n');
          const pids = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            return parts[parts.length - 1];
          }).filter(pid => pid && pid !== '0');
          resolve(pids.length > 0 ? pids[0] : null);
        } else {
          const pid = stdout.trim().split('\n')[0];
          resolve(pid || null);
        }
      }
    });
  });
}

// 关闭占用端口的进程
function killProcess(pid) {
  return new Promise((resolve) => {
    if (!pid) {
      resolve(true);
      return;
    }
    
    const command = process.platform === 'win32'
      ? `taskkill /F /PID ${pid}`
      : `kill -9 ${pid}`;
    
    exec(command, (error) => {
      if (error) {
        addLog(`⚠️ 关闭进程 ${pid} 失败: ${error.message}`);
        resolve(false);
      } else {
        addLog(`✅ 已关闭占用端口的进程 (PID: ${pid})`);
        resolve(true);
      }
    });
  });
}

// 获取本机 IP 地址
function getLocalIPAddress() {
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

// 启动服务器
async function startServer() {
  return new Promise(async (resolve, reject) => {
    try {
      const PORT = 3000;
      
      // 检查端口是否被占用
      addLog('🔍 检查端口占用情况...');
      const pid = await checkPort(PORT);
      
      if (pid) {
        addLog(`⚠️ 端口 ${PORT} 已被进程 ${pid} 占用，正在关闭...`);
        const killed = await killProcess(pid);
        if (!killed) {
          addLog('⚠️ 无法关闭旧进程，尝试继续启动...');
        }
        // 等待端口释放
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // 设置环境变量
      process.env.NODE_ENV = 'production';
      process.env.PORT = PORT.toString();
      
      // 设置静态文件路径
      process.env.STATIC_PATH = getResourcePath('client/build');
      
      // 设置数据库路径 - 使用用户数据目录
      const userDataPath = app.getPath('userData');
      process.env.DB_PATH = path.join(userDataPath, 'hospital.db');
      
      addLog('📂 数据库路径: ' + process.env.DB_PATH);
      addLog('📂 静态文件路径: ' + process.env.STATIC_PATH);
      addLog('🚀 正在启动服务器...');
      
      // 设置 sqlite3 的路径，使用 unpacked 中的原生模块
      if (!isDev) {
        const sqlite3Path = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sqlite3');
        addLog('📂 SQLite3 路径: ' + sqlite3Path);
        
        // 修改 require 路径
        const Module = require('module');
        const originalResolveFilename = Module._resolveFilename;
        Module._resolveFilename = function(request, parent, isMain, options) {
          if (request === 'sqlite3') {
            return path.join(sqlite3Path, 'lib', 'sqlite3.js');
          }
          return originalResolveFilename(request, parent, isMain, options);
        };
      }
      
      // 加载服务器
      const serverPath = isDev 
        ? path.join(__dirname, 'server', 'index.js')
        : path.join(process.resourcesPath, 'app.asar', 'server', 'index.js');
      
      addLog('📂 服务器路径: ' + serverPath);
      
      // 清除缓存
      if (require.cache[serverPath]) {
        delete require.cache[serverPath];
      }
      
      // 启动服务器
      const serverModule = require(serverPath);
      serverInstance = serverModule.server || serverModule;
      
      // 等待服务器启动
      setTimeout(() => {
        serverStarted = true;
        const localIP = getLocalIPAddress();
        addLog('✅ 服务器启动成功！');
        addLog('🌐 本地访问: http://localhost:' + PORT);
        addLog('🌐 内网访问: http://' + localIP + ':' + PORT);
        addLog('📱 内网设备可通过以上地址访问服务');
        resolve();
      }, 2000);
      
    } catch (err) {
      addLog('❌ 服务器启动失败: ' + err.message);
      addLog('❌ 错误堆栈: ' + err.stack);
      reject(err);
    }
  });
}

// 添加日志
function addLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${message}`;
  serverLogs.push(logEntry);
  
  // 保持最近 100 条日志
  if (serverLogs.length > 100) {
    serverLogs.shift();
  }
  
  // 更新窗口
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', logEntry);
  }
  
  console.log(logEntry);
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    minWidth: 500,
    minHeight: 400,
    title: '医院手术排班系统 - 服务端',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: true,
    maximizable: false,
    show: false
  });

  // 加载 UI
  const html = generateServerUI();
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 关闭时隐藏到托盘
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// 生成服务端 UI
function generateServerUI() {
  const logs = serverLogs.join('\n');
  const localIP = getLocalIPAddress();
  const localUrl = `http://localhost:3000`;
  const networkUrl = `http://${localIP}:3000`;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>服务端控制台</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      min-height: 100vh;
      padding: 20px;
    }
    .header {
      text-align: center;
      padding: 20px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(46, 204, 113, 0.2);
      border: 1px solid rgba(46, 204, 113, 0.5);
      border-radius: 20px;
      font-size: 14px;
    }
    .status.running { color: #2ecc71; }
    .status.stopped { 
      background: rgba(231, 76, 60, 0.2);
      border-color: rgba(231, 76, 60, 0.5);
      color: #e74c3c;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #2ecc71;
      animation: pulse 2s infinite;
    }
    .status.stopped .status-dot {
      background: #e74c3c;
      animation: none;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .info-card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: rgba(255,255,255,0.6); font-size: 14px; }
    .info-value { 
      color: #3498db; 
      font-family: monospace;
      font-size: 14px;
    }
    .info-value.copyable {
      cursor: pointer;
      padding: 2px 8px;
      background: rgba(52, 152, 219, 0.2);
      border-radius: 4px;
    }
    .info-value.copyable:hover {
      background: rgba(52, 152, 219, 0.3);
    }
    .logs {
      background: #0d1117;
      border-radius: 8px;
      padding: 12px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      line-height: 1.6;
      height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .logs::-webkit-scrollbar {
      width: 6px;
    }
    .logs::-webkit-scrollbar-track {
      background: transparent;
    }
    .logs::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
    }
    .section-title {
      font-size: 14px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 8px;
    }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s;
      margin-right: 8px;
    }
    .btn-primary {
      background: #3498db;
      color: white;
    }
    .btn-primary:hover {
      background: #2980b9;
    }
    .actions {
      margin-top: 16px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏥 医院手术排班系统 - 服务端</h1>
    <div class="status ${serverStarted ? 'running' : 'stopped'}">
      <span class="status-dot"></span>
      ${serverStarted ? '服务运行中' : '服务已停止'}
    </div>
  </div>
  
  <div class="info-card">
    <div class="info-row">
      <span class="info-label">本地访问</span>
      <span class="info-value copyable" onclick="copyText('${localUrl}')">${localUrl}</span>
    </div>
    <div class="info-row">
      <span class="info-label">内网访问</span>
      <span class="info-value copyable" onclick="copyText('${networkUrl}')" style="color: #2ecc71; font-weight: bold;">${networkUrl}</span>
    </div>
    <div class="info-row">
      <span class="info-label">本机 IP</span>
      <span class="info-value">${localIP}</span>
    </div>
    <div class="info-row">
      <span class="info-label">端口</span>
      <span class="info-value">3000</span>
    </div>
    <div class="info-row">
      <span class="info-label">状态</span>
      <span class="info-value" style="color: ${serverStarted ? '#2ecc71' : '#e74c3c'}">${serverStarted ? '运行中' : '已停止'}</span>
    </div>
  </div>
  
  <div class="section-title">📋 运行日志</div>
  <div class="logs" id="logs">${logs}</div>
  
  <div class="actions">
    <button class="btn btn-primary" onclick="openBrowser()">🌐 打开浏览器</button>
    <button class="btn btn-primary" onclick="copyText('${localUrl}')">📋 复制本地地址</button>
    <button class="btn btn-primary" onclick="copyText('${networkUrl}')">📋 复制内网地址</button>
  </div>
  
  <script>
    const { ipcRenderer, shell, clipboard } = require('electron');
    
    // 监听日志更新
    ipcRenderer.on('log', (event, message) => {
      const logs = document.getElementById('logs');
      logs.textContent += '\\n' + message;
      logs.scrollTop = logs.scrollHeight;
    });
    
    function openBrowser() {
      shell.openExternal('http://localhost:3000');
    }
    
    function copyText(text) {
      clipboard.writeText(text);
      alert('已复制到剪贴板: ' + text);
    }
  </script>
</body>
</html>
`;
}

// 创建系统托盘
function createTray() {
  // 创建一个简单的图标
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAjUlEQVR4nGNgGLTAH4j/48L/kfj/8Rn8HwiIMTAfSQM+g/8j8f+DXECMBhS+P5IG/KOBP8iF/4liADYNuAz+T7QL8BlMkguIdhHRBhDtBUINwBcGJIcBsS4g1AWEDEYXg4QJNQYa7A+mCYl/E2MAvjD4T2wYoItBwv+JCYNBmRfwhQFRuQBbIoJK4huyGgAAAOQzFYqsGQgAAAAASUVORK5CYII=');
  
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '显示控制台', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    { 
      label: '打开浏览器', 
      click: () => {
        require('electron').shell.openExternal('http://localhost:3000');
      }
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('医院手术排班系统 - 服务端');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}

// 应用就绪
app.whenReady().then(async () => {
  createWindow();
  createTray();
  
  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox('启动失败', err.message);
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS 上不退出，保持托盘运行
});

// 应用退出前关闭服务器
app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverInstance && serverInstance.close) {
    addLog('🛑 正在关闭服务器...');
    serverInstance.close(() => {
      addLog('✅ 服务器已关闭');
    });
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
