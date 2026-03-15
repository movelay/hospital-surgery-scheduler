# 快速开始指南

## 5分钟快速部署

### 第一步：安装依赖

```bash
# 一键安装所有依赖
npm run install-all
```

或者分别安装：

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd client
npm install
cd ..
```

### 第二步：构建前端

```bash
npm run build
```

### 第三步：启动服务器

**方式1：使用启动脚本（推荐）**

```bash
# Linux/Mac
./start.sh

# Windows
start.bat
```

**方式2：手动启动**

```bash
NODE_ENV=production npm start
```

### 第四步：访问系统

1. 打开浏览器访问：`http://localhost:3000`
2. 使用默认管理员账户登录：
   - 用户名：`admin`
   - 密码：`admin123`

### 第五步：创建医生账户

1. 登录后点击"用户管理"
2. 点击"新增用户"
3. 填写医生信息并创建账户

## 开发模式

如果需要开发调试：

```bash
# 同时启动后端和前端开发服务器
npm run dev
```

- 后端：http://localhost:3000
- 前端：http://localhost:3001（自动打开）

## 内网部署

1. 确保服务器在内网可访问
2. 启动服务器后，其他设备通过以下地址访问：
   ```
   http://[服务器IP地址]:3000
   ```
   例如：`http://192.168.1.100:3000`

3. 手机端访问：
   - 在手机浏览器中打开服务器地址
   - 可以添加到主屏幕（PWA支持）

## 常见问题

**Q: 端口被占用怎么办？**

A: 修改 `.env` 文件中的 `PORT` 值，例如改为 `3001`

**Q: 忘记密码怎么办？**

A: 删除 `data/hospital.db` 文件，重新启动会创建新的默认管理员账户

**Q: 如何备份数据？**

A: 复制 `data/hospital.db` 文件即可

## 下一步

- 查看 [README.md](README.md) 了解详细功能
- 查看 [DEPLOYMENT.md](DEPLOYMENT.md) 了解生产环境部署
- 修改 `.env` 中的 `JWT_SECRET` 提高安全性
