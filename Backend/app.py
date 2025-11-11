from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
import datetime
from flask_sqlalchemy import SQLAlchemy
import os
from dotenv import load_dotenv  # 新增：加载.env文件

# --- 加载环境变量（根据环境自动切换配置）---
# 优先加载生产环境配置，若不存在则加载开发环境.env文件
if os.getenv("FLASK_ENV") == "production":
    load_dotenv(".env.production")  # 生产环境：加载.env.production
else:
    load_dotenv(".env")  # 开发环境：加载.env（本地）

# --- 初始化Flask应用 ---
app = Flask(__name__)

# --- 从环境变量读取配置（核心优化：无硬编码）---
# 数据库配置
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")  # 从环境变量读取
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# JWT配置（生产环境务必用强随机密钥）
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(hours=1)

# CORS配置（支持多个域名，用逗号分隔）
cors_origins = os.getenv("CORS_ORIGINS").split(",")  # 比如 "http://localhost:5173,https://xxx.com"
CORS(app, resources={r"/api/*": {"origins": cors_origins}})

# --- 初始化扩展 ---
jwt = JWTManager(app)
db = SQLAlchemy(app)

# --- 数据库模型（不变）---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(512), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.now)

    def __repr__(self):
        return f'<User {self.username}>'

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# --- 路由（不变）---
@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"msg": "用户名和密码不能为空"}), 400

    existing_user = User.query.filter_by(username=username).first()
    if existing_user:
        return jsonify({"msg": "用户已存在"}), 409

    new_user = User(username=username)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()

    access_token = create_access_token(identity=username)
    return jsonify({
        "msg": "注册成功",
        "code": 200,
        "token": access_token,
        "username": username,
    }), 201

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
         return jsonify({"msg": "用户名或密码错误"}), 401

    access_token = create_access_token(identity=username)
    return jsonify({
        "msg": "登录成功",
        "code": 200,
        "token": access_token,
        "username": username,
    }), 200

@app.route("/api/protected", methods=["GET"])
@jwt_required()
def protected():
    current_user = get_jwt_identity()
    return jsonify({"msg": "受保护接口访问成功", "user": current_user}), 200

# --- 数据库初始化和运行优化 ---
def init_db():
    """单独的数据库初始化函数，避免重复执行"""
    with app.app_context():
        db.create_all()
        print("数据库表已检查/创建完成。")

if __name__ == "__main__":
    # 开发环境自动初始化数据库，生产环境注释掉（手动初始化）
    if os.getenv("FLASK_ENV") == "development":
        init_db()

    # 从环境变量读取端口，默认5000；生产环境禁用debug
    app.run(
        debug=os.getenv("FLASK_ENV") == "development",  # 开发环境才启用debug
        port=int(os.getenv("PORT", 5000)),
        host="0.0.0.0"
    )