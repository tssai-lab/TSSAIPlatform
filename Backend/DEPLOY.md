# 后端部署说明
## 1. 环境准备
- 安装Python 3.8+
- 安装PostgreSQL数据库（创建对应的数据库和用户）
- 克隆仓库后，进入Backend文件夹：`cd Backend`

## 2. 配置生产环境变量
1. 复制.env.production模板，修改为实际配置：
   ```bash
   cp .env.production .env  # 服务器上执行，直接用.env存储生产配置
2. 编辑.env文件，替换以下内容：
- DATABASE_URL：生产环境数据库连接地址
- JWT_SECRET_KEY：用命令生成强密钥：openssl rand -hex 32
- CORS_ORIGINS：前端生产域名
- PORT：生产环境端口（如 8000）
