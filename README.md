# 医院手术排班管理系统

一个功能完整的医院科室手术排班管理系统，支持多平台部署和访问。

## 文档导航

- 完整使用说明（推荐先看）：[`USAGE_GUIDE.md`](./USAGE_GUIDE.md)
- 医生快速上手（一页版）：[`DOCTOR_QUICK_GUIDE.md`](./DOCTOR_QUICK_GUIDE.md)
- 管理员操作手册：[`ADMIN_OPERATION_GUIDE.md`](./ADMIN_OPERATION_GUIDE.md)

### 推荐阅读路径

- 医生：先读 [`DOCTOR_QUICK_GUIDE.md`](./DOCTOR_QUICK_GUIDE.md)，再按需查 [`USAGE_GUIDE.md`](./USAGE_GUIDE.md)
- 管理员：先读 [`ADMIN_OPERATION_GUIDE.md`](./ADMIN_OPERATION_GUIDE.md)，再参考 [`USAGE_GUIDE.md`](./USAGE_GUIDE.md)
- 运维/部署：直接看 [`USAGE_GUIDE.md`](./USAGE_GUIDE.md) 的“安装、部署、故障排查”章节

## 功能特性

### 1. 手术管理
- ✅ 查看、增加、删除、修改每天的手术室安排
- ✅ 手术关联信息：医生、病人、手术项目、时间安排、手术室号码
- ✅ 自动检测手术室时间冲突
- ✅ 按日期筛选查看手术安排

### 2. 用户权限管理
- ✅ 管理员账户：管理所有后台功能
  - 增加/删除/修改医生账号
  - 调整每台手术的信息
  - 修改手术状态
- ✅ 普通医生账户：操作手术权限
  - 登录后只能查看和操作自己创建的手术
  - 可以创建、编辑、删除自己的手术安排

### 3. 多平台支持
- ✅ Web端：响应式设计，支持电脑和手机浏览器访问
- ✅ 桌面应用：使用Electron打包，支持Mac、Windows、Linux
- ✅ 移动端：PWA支持，可添加到手机主屏幕

## 技术栈

- **后端**: Node.js + Express + SQLite
- **前端**: React + React Router
- **认证**: JWT Token
- **打包**: Electron (桌面应用)

## 快速开始

### 环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0

### 安装步骤

1. **安装依赖**

```bash
# 安装后端和根目录依赖
npm install

# 安装前端依赖
cd client
npm install
cd ..
```

或者使用一键安装：

```bash
npm run install-all
```

2. **配置环境变量**

编辑 `.env` 文件，修改JWT密钥（生产环境必须修改）：

```
PORT=3000
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
```

3. **启动开发服务器**

```bash
# 同时启动后端和前端（开发模式）
npm run dev
```

或者分别启动：

```bash
# 终端1：启动后端
npm run server

# 终端2：启动前端
npm run client
```

4. **访问应用**

- Web端：http://localhost:3000
- 默认管理员账户：`admin` / `admin123`

## 部署说明

### 内网部署

1. **构建前端**

```bash
cd client
npm run build
cd ..
```

2. **启动生产服务器**

```bash
NODE_ENV=production npm start
```

3. **配置内网访问**

服务器启动后，局域网内的其他设备可以通过以下地址访问：
- `http://[服务器IP]:3000`

例如：`http://192.168.1.100:3000`

### 打包桌面应用

#### Mac

```bash
npm run build
npm run electron:build
```

生成的安装包在 `dist` 目录下。

#### Windows

```bash
npm run build
npm run electron:build
```

#### 所有平台

```bash
npm run build
npm run electron:build
```

### 移动端访问

1. 确保服务器在内网可访问
2. 在手机浏览器中打开服务器地址
3. 添加到主屏幕（PWA支持）

## 项目结构

```
hospital-surgery-scheduler/
├── server/                 # 后端服务器
│   ├── index.js           # 服务器入口
│   ├── database/          # 数据库相关
│   │   └── init.js        # 数据库初始化
│   ├── middleware/        # 中间件
│   │   └── auth.js        # 认证中间件
│   └── routes/            # 路由
│       ├── auth.js        # 认证路由
│       ├── surgery.js     # 手术路由
│       └── user.js        # 用户路由
├── client/                # 前端应用
│   ├── src/
│   │   ├── components/    # React组件
│   │   ├── pages/         # 页面组件
│   │   ├── services/      # API服务
│   │   └── styles/        # 样式文件
│   └── public/            # 静态文件
├── main.js                # Electron主进程
├── package.json           # 项目配置
└── README.md             # 说明文档
```

## 数据库

系统使用SQLite数据库，数据库文件位于 `data/hospital.db`。

### 数据表结构

- **users**: 用户表（管理员和医生）
- **surgeries**: 手术表

数据库会在首次启动时自动创建，并创建默认管理员账户。

## 安全说明

⚠️ **重要**：生产环境部署前请务必：

1. 修改 `.env` 文件中的 `JWT_SECRET`
2. 修改默认管理员密码
3. 使用HTTPS（如果通过公网访问）
4. 定期备份数据库文件

## 使用说明

### 管理员操作

1. 使用 `admin` / `admin123` 登录
2. 点击"用户管理"创建医生账户
3. 可以查看、编辑、删除所有手术
4. 可以修改手术状态

### 医生操作

1. 使用管理员创建的账户登录
2. 查看自己的手术安排
3. 创建新的手术安排
4. 编辑或删除自己的手术

## 常见问题

### Q: 如何修改端口？

A: 修改 `.env` 文件中的 `PORT` 值。

### Q: 忘记管理员密码怎么办？

A: 删除 `data/hospital.db` 文件，重新启动应用会创建新的默认管理员账户。

### Q: 如何备份数据？

A: 复制 `data/hospital.db` 文件即可。

### Q: 支持多台服务器部署吗？

A: 当前版本使用SQLite，适合单机部署。如需多服务器，需要迁移到MySQL/PostgreSQL等数据库。

## 许可证

MIT License

## 技术支持

如有问题，请查看代码注释或提交Issue。
