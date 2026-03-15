#!/bin/bash

# 医院手术排班系统 - 服务端启动脚本
# 双击此文件即可启动服务器

cd "$(dirname "$0")"

echo "=========================================="
echo "  🏥 医院手术排班系统 - 服务端"
echo "=========================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    echo ""
    read -p "按回车键退出..."
    exit 1
fi

echo "📦 Node.js 版本: $(node -v)"
echo ""

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📥 首次运行，正在安装依赖..."
    npm install
    echo ""
fi

# 设置环境变量
export NODE_ENV=production
export PORT=3000

echo "🚀 正在启动服务器..."
echo ""
echo "----------------------------------------"
echo "  服务地址: http://localhost:3000"
echo "  数据库位置: ./data/hospital.db"
echo "----------------------------------------"
echo ""
echo "💡 提示:"
echo "   - 保持此窗口打开以维持服务运行"
echo "   - 按 Ctrl+C 停止服务器"
echo "   - 客户端连接地址: http://localhost:3000"
echo ""
echo "=========================================="
echo ""

# 启动服务器
node server/index.js

# 如果服务器退出
echo ""
echo "服务器已停止"
read -p "按回车键退出..."
