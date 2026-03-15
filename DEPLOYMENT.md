# 部署指南

## 内网部署步骤

### 方式一：直接运行（推荐用于测试）

1. **准备服务器**
   - 确保服务器已安装 Node.js (>= 14.0.0)
   - 确保服务器可以访问内网

2. **上传项目文件**
   - 将整个项目文件夹上传到服务器
   - 或使用 git clone（如果有版本控制）

3. **安装依赖**
   ```bash
   # Linux/Mac
   ./start.sh
   
   # Windows
   start.bat
   ```
   
   或者手动安装：
   ```bash
   npm install
   cd client
   npm install
   cd ..
   npm run build
   ```

4. **配置环境**
   - 编辑 `.env` 文件，修改 `JWT_SECRET`（重要！）
   - 如需修改端口，修改 `PORT` 值

5. **启动服务**
   ```bash
   # 生产模式
   NODE_ENV=production npm start
   
   # 或使用启动脚本
   ./start.sh  # Linux/Mac
   start.bat   # Windows
   ```

6. **访问系统**
   - 服务器本地：`http://localhost:3000`
   - 内网其他设备：`http://[服务器IP]:3000`
   - 例如：`http://192.168.1.100:3000`

### 方式二：使用 PM2（推荐用于生产环境）

1. **安装 PM2**
   ```bash
   npm install -g pm2
   ```

2. **构建前端**
   ```bash
   cd client
   npm run build
   cd ..
   ```

3. **启动应用**
   ```bash
   NODE_ENV=production pm2 start server/index.js --name surgery-scheduler
   ```

4. **设置开机自启**
   ```bash
   pm2 save
   pm2 startup
   ```

5. **查看状态**
   ```bash
   pm2 status
   pm2 logs surgery-scheduler
   ```

### 方式三：打包为桌面应用

1. **构建前端**
   ```bash
   cd client
   npm run build
   cd ..
   ```

2. **打包应用**
   ```bash
   npm run electron:build
   ```

3. **分发安装包**
   - Mac: `dist/*.dmg` 或 `dist/*.zip`
   - Windows: `dist/*.exe` 或 `dist/*.portable.exe`
   - Linux: `dist/*.AppImage` 或 `dist/*.deb`

4. **安装使用**
   - 在各设备上安装对应的安装包
   - 首次运行会自动启动服务器
   - 其他设备可通过内网IP访问

## 移动端访问配置

### PWA 支持

系统已配置 PWA，支持添加到手机主屏幕：

1. 在手机浏览器中打开系统地址
2. 点击浏览器菜单（通常是三个点）
3. 选择"添加到主屏幕"或"安装应用"
4. 即可像原生应用一样使用

### 响应式设计

系统已采用响应式设计，自动适配手机屏幕：
- 支持触摸操作
- 自适应布局
- 优化的移动端界面

## 防火墙配置

如果无法从其他设备访问，请检查防火墙设置：

### Linux (iptables)
```bash
# 允许3000端口
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

### Windows
1. 打开"Windows Defender 防火墙"
2. 点击"高级设置"
3. 添加入站规则，允许端口3000

### Mac
1. 系统偏好设置 > 安全性与隐私 > 防火墙
2. 点击"防火墙选项"
3. 添加Node.js或允许端口3000

## 数据库备份

### 手动备份
```bash
# 复制数据库文件
cp data/hospital.db data/hospital.db.backup
```

### 自动备份脚本
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
cp data/hospital.db "data/backup/hospital_${DATE}.db"
echo "备份完成: hospital_${DATE}.db"
```

设置定时任务（crontab）：
```bash
# 每天凌晨2点备份
0 2 * * * /path/to/backup.sh
```

## 性能优化

### 1. 使用反向代理（Nginx）

```nginx
server {
    listen 80;
    server_name your-domain.local;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. 启用 HTTPS（可选）

使用 Let's Encrypt 或自签名证书：
```bash
# 使用 Nginx + Let's Encrypt
sudo certbot --nginx -d your-domain.local
```

## 故障排查

### 问题1：无法访问
- 检查服务器是否运行：`ps aux | grep node`
- 检查端口是否被占用：`lsof -i :3000` (Mac/Linux) 或 `netstat -ano | findstr :3000` (Windows)
- 检查防火墙设置

### 问题2：数据库错误
- 检查 `data` 目录权限
- 确保数据库文件可写
- 查看服务器日志

### 问题3：前端无法加载
- 确保已运行 `npm run build`
- 检查 `client/build` 目录是否存在
- 检查服务器日志中的错误信息

### 问题4：登录失败
- 检查数据库是否已初始化
- 尝试删除 `data/hospital.db` 重新初始化
- 检查 JWT_SECRET 配置

## 安全建议

1. **修改默认密码**
   - 首次登录后立即修改管理员密码
   - 使用强密码策略

2. **定期备份**
   - 设置自动备份任务
   - 备份文件存储在安全位置

3. **网络安全**
   - 仅在内网使用，不要暴露到公网
   - 如需公网访问，必须使用HTTPS

4. **更新依赖**
   - 定期运行 `npm audit` 检查安全漏洞
   - 及时更新依赖包

5. **访问控制**
   - 限制服务器访问权限
   - 使用防火墙限制访问来源

## 技术支持

如遇到问题，请检查：
1. 服务器日志
2. 浏览器控制台错误
3. 网络连接状态
4. 数据库文件完整性
