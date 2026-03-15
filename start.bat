@echo off
chcp 65001 >nul
echo =========================================
echo   医院手术排班管理系统
echo =========================================
echo.

REM 检查Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到Node.js，请先安装Node.js
    pause
    exit /b 1
)

REM 检查npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到npm，请先安装npm
    pause
    exit /b 1
)

echo 检查依赖...

REM 检查根目录依赖
if not exist "node_modules" (
    echo 安装根目录依赖...
    call npm install
)

REM 检查客户端依赖
if not exist "client\node_modules" (
    echo 安装客户端依赖...
    cd client
    call npm install
    cd ..
)

REM 检查数据库目录
if not exist "data" (
    mkdir data
)

REM 检查是否已构建前端
if not exist "client\build" (
    echo 构建前端应用...
    cd client
    call npm run build
    cd ..
)

echo.
echo 启动服务器...
echo 访问地址: http://localhost:3000
echo 默认管理员: admin / admin123
echo.
echo 按 Ctrl+C 停止服务器
echo.

REM 启动服务器
set NODE_ENV=production
call npm start

pause
