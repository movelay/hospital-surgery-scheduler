const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// 判断是否为打包后的应用
const isDev = !app.isPackaged;

// 配置文件路径
function getConfigPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config.json');
}

// 读取配置
function loadConfig() {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('读取配置失败:', e);
  }
  // 默认配置
  return {
    serverUrl: 'http://localhost:3000'
  };
}

// 保存配置
function saveConfig(config) {
  const configPath = getConfigPath();
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    console.error('保存配置失败:', e);
    return false;
  }
}

function createWindow() {
  const config = loadConfig();
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '医院手术排班系统',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    backgroundColor: '#f0f2f5'
  });

  // 窗口准备好后再显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 加载前端页面
  const loadURL = config.serverUrl;
  console.log('连接服务器:', loadURL);
  
  // 尝试加载，带重试机制
  let retryCount = 0;
  const maxRetries = 5;
  
  const tryLoad = () => {
    mainWindow.loadURL(loadURL).catch(err => {
      console.error('连接失败:', err.message);
      retryCount++;
      if (retryCount < maxRetries) {
        setTimeout(tryLoad, 2000);
      } else {
        // 显示连接失败页面
        showConnectionError(config.serverUrl);
      }
    });
  };
  
  tryLoad();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // 开发环境打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

function showConnectionError(serverUrl) {
  const errorHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>连接失败</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 16px;
          padding: 48px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center;
        }
        .icon {
          font-size: 64px;
          margin-bottom: 24px;
        }
        h1 {
          color: #1a1a2e;
          font-size: 24px;
          margin-bottom: 16px;
        }
        p {
          color: #666;
          margin-bottom: 24px;
          line-height: 1.6;
        }
        .server-url {
          background: #f5f5f5;
          padding: 12px 16px;
          border-radius: 8px;
          font-family: monospace;
          color: #e74c3c;
          margin-bottom: 24px;
          word-break: break-all;
        }
        .form-group {
          margin-bottom: 20px;
          text-align: left;
        }
        label {
          display: block;
          margin-bottom: 8px;
          color: #333;
          font-weight: 500;
        }
        input {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
          transition: border-color 0.3s;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
        }
        .btn {
          width: 100%;
          padding: 14px 24px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          margin-top: 8px;
        }
        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
        }
        .btn-secondary {
          background: #f5f5f5;
          color: #333;
        }
        .btn-secondary:hover {
          background: #e8e8e8;
        }
        .tips {
          margin-top: 24px;
          padding: 16px;
          background: #fff3cd;
          border-radius: 8px;
          text-align: left;
          font-size: 14px;
          color: #856404;
        }
        .tips strong {
          display: block;
          margin-bottom: 8px;
        }
        .tips code {
          background: rgba(0,0,0,0.1);
          padding: 2px 6px;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">🔌</div>
        <h1>无法连接到服务器</h1>
        <p>请确保服务器已启动并且地址正确</p>
        <div class="server-url">${serverUrl}</div>
        
        <div class="form-group">
          <label>服务器地址</label>
          <input type="text" id="serverUrl" value="${serverUrl}" placeholder="http://localhost:3000">
        </div>
        
        <button class="btn btn-primary" onclick="reconnect()">重新连接</button>
        <button class="btn btn-secondary" onclick="saveAndReconnect()">保存设置并连接</button>
        
        <div class="tips">
          <strong>💡 提示</strong>
          请先在服务器上运行以下命令启动服务：<br>
          <code>cd hospital-surgery-scheduler && npm start</code>
        </div>
      </div>
      
      <script>
        function reconnect() {
          const url = document.getElementById('serverUrl').value;
          window.location.href = url;
        }
        
        function saveAndReconnect() {
          const url = document.getElementById('serverUrl').value;
          // 通过 IPC 保存配置
          if (window.electronAPI) {
            window.electronAPI.saveConfig({ serverUrl: url });
          }
          window.location.href = url;
        }
      </script>
    </body>
    </html>
  `;
  
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml));
}

// IPC 处理
ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, config) => {
  return saveConfig(config);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
