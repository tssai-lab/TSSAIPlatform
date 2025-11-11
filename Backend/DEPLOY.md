# 后端服务部署指南



## 一、环境准备



- **操作系统**：Linux（推荐 CentOS 7+/Ubuntu 20.04+）或 Windows Server（生产环境优先选 Linux）

- **Python 3.8+ 安装**（以 Ubuntu 为例）：

    ```Bash
    sudo apt update && sudo apt install python3.8 python3-pip python3-venv
    ```

- **PostgreSQL 12+ 安装与初始化**（以 Ubuntu 为例）：

    ```Bash
    sudo apt install postgresql postgresql-contrib
    # 进入 PostgreSQL 命令行创建数据库和用户
    sudo -u postgres psql
    CREATE DATABASE tssai_platform_db;
    CREATE USER tssai_user WITH PASSWORD '你的强密码';
    GRANT ALL PRIVILEGES ON DATABASE tssai_platform_db TO tssai_user;
    \q
    ```

- **代码克隆**：

    ```Bash
    git clone https://github.com/你的用户名/你的仓库名.git
    cd 你的仓库名/Backend
    ```



## 二、生产环境变量配置（核心步骤）



### 1. 创建并编辑 `.env` 文件



在 `Backend` 目录下创建并编辑 `.env` 文件，存储生产环境的敏感配置：



```Bash
nano .env
```



在文件中填入以下内容（**务必替换为实际值**）：



```Plain Text
FLASK_ENV=production
DATABASE_URL=postgresql://tssai_user:你的强密码@localhost:5432/tssai_platform_db
JWT_SECRET_KEY=$(openssl rand -hex 32)
CORS_ORIGINS=https://你的前端域名.com
PORT=8000
```



保存并退出（`Ctrl+X` → `Y` → `Enter`）。



### 2. 验证环境变量（可选）



```Bash
echo "DATABASE_URL: $(cat .env | grep DATABASE_URL | cut -d'=' -f2)"
echo "JWT_SECRET_KEY: $(cat .env | grep JWT_SECRET_KEY | cut -d'=' -f2 | head -c 10)***"
```



## 三、依赖安装与数据库初始化



### 1. 虚拟环境与依赖安装



```Bash
python3 -m venv venv
source venv/bin/activate  # Linux/Mac 激活；Windows: venv\Scripts\Activate.ps1
pip install -r requirements.txt
```



### 2. 数据库初始化（仅首次执行）



```Bash
python -c "from app import app, db; with app.app_context(): db.create_all()"
```



## 四、启动生产服务（Gunicorn 方式）



### 1. 安装 Gunicorn



```Bash
pip install gunicorn
```



### 2. 后台启动服务



```Bash
nohup gunicorn -w 4 -b 0.0.0.0:$PORT app:app > backend.log 2>&1 &
```



### 3. 验证服务状态



```Bash
tail -f backend.log  # 查看日志
ps aux | grep gunicorn  # 查看进程
```



## 五、Nginx 反向代理与 HTTPS（可选）



### 1. Nginx 安装与配置



```Bash
sudo apt install nginx
sudo nano /etc/nginx/conf.d/backend.conf
```



在 `backend.conf` 中填入：



```Nginx
server {
    listen 80;
    server_name api.你的域名.com;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```



重启 Nginx：



```Bash
sudo nginx -s reload
```



### 2. 配置 HTTPS（Let’s Encrypt 免费证书）



```Bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.你的域名.com
```



## 六、维护操作



### 1. 查看日志



```Bash
tail -f backend.log
```



### 2. 重启服务



```Bash
ps aux | grep gunicorn | grep -v grep | awk '{print $2}' | xargs kill -9
nohup gunicorn -w 4 -b 0.0.0.0:$PORT app:app > backend.log 2>&1 &
```



### 3. 代码更新



```Bash
git pull origin main
pip install -r requirements.txt  # 若依赖更新
ps aux | grep gunicorn | grep -v grep | awk '{print $2}' | xargs kill -9
nohup gunicorn -w 4 -b 0.0.0.0:$PORT app:app > backend.log 2>&1 &
```



## 七、安全注意事项



- `JWT_SECRET_KEY` 必须通过 `openssl rand -hex 32` 生成强随机值，切勿复用或泄露。

- 数据库用户仅授予必要权限，避免使用 `postgres` 超级用户直接连接。

- 生产环境仅开放 80/443（Nginx）和 22（SSH）端口，关闭其他端口。

- 务必启用 HTTPS，防止数据明文传输。
> （注：文档部分内容可能由 AI 生成）