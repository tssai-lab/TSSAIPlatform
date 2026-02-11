from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from minio import Minio
import uvicorn

app = FastAPI()

# 1. 允许跨域 (解决前端 Access-Control-Allow-Origin 报错)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源访问，生产环境可以改成你的前端地址
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. 配置 MinIO 连接
# 注意：这里连接的是我们刚才搭建的 9010 端口
minio_client = Minio(
    "localhost:9010",
    access_key="admin",
    secret_key="password123",
    secure=False
)

# 3. 确保存储桶存在
bucket_name = "tss-files"
if not minio_client.bucket_exists(bucket_name):
    minio_client.make_bucket(bucket_name)

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        # 4. 接收文件并上传到 MinIO
        # object_name 就是在 MinIO 里保存的文件名
        object_name = file.filename
        
        # 使用 put_object 直接上传流
        minio_client.put_object(
            bucket_name,
            object_name,
            file.file,
            length=-1,
            part_size=10*1024*1024 
        )
        
        # 5. 生成可访问的链接 (如果有需要的话)
        file_url = f"http://localhost:9010/{bucket_name}/{object_name}"
        
        return {
            "message": "上传成功", 
            "name": file.filename,
            "url": file_url
        }
    except Exception as e:
        print(f"上传失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # 启动服务，运行在 8000 端口
    uvicorn.run(app, host="0.0.0.0", port=8000)