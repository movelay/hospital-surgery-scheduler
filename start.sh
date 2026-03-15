#!/bin/bash

# 医院手术排班系统启动脚本

echo "========================================="
echo "  医院手术排班管理系统"
echo "========================================="
echo ""

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到Node.js，请先安装Node.js"
    exit 1
fi

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "错误: 未找到npm，请先安装npm"
    exit 1
fi

echo "检查依赖..."

# 检查根目录依赖
if [ ! -d "node_modules" ]; then
    echo "安装根目录依赖..."
    npm install
fi

# 检查客户端依赖
if [ ! -d "client/node_modules" ]; then
    echo "安装客户端依赖..."
    cd client
    npm install
    cd ..
fi

# 检查数据库目录
if [ ! -d "data" ]; then
    mkdir -p data
fi

# 检查是否已构建前端
if [ ! -d "client/build" ]; then
    echo "构建前端应用..."
    cd client
    npm run build
    cd ..
fi

echo ""
echo "启动服务器..."
echo "访问地址: http://localhost:3000"
echo "默认管理员: admin / admin123"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

# 启动服务器
NODE_ENV=production npm start
