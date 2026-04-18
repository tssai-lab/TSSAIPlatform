# 后端对接 MinIO 存储模型示例

前端通过分片上传接口把模型文件发到后端，后端需要把分片写入 MinIO，并落库模型元数据。  
本文档提供 **Java（Spring Boot）**、**Node.js** 和 **Python** 三种示例，按你当前 Docker MinIO 配置编写。

## MinIO 配置（与你的 Docker 一致）

| 配置项   | 值 |
|----------|-----|
| Endpoint | `http://127.0.0.1:9010`（主机访问；同机 Docker 可用 `http://minio-tss:9000`） |
| 控制台   | `http://127.0.0.1:9011` |
| Access Key | `admin` |
| Secret Key | `password123` |
| Bucket   | 示例中统一用 `models`，需在 MinIO 中先创建或代码里自动创建 |
| 数据目录 | 仓库根目录 `tss_minio_data`，Docker 挂载到容器内 `/data` |

---

## 一、Java 示例（Spring Boot）

### 1. 依赖（Maven）

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>io.minio</groupId>
        <artifactId>minio</artifactId>
        <version>8.5.7</version>
    </dependency>
</dependencies>
```

### 2. 配置（application.yml）

```yaml
minio:
  endpoint: http://127.0.0.1:9010
  access-key: admin
  secret-key: password123
  bucket: models
```

### 3. MinIO 配置类

```java
// config/MinioConfig.java
package com.example.config;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.annotation.PostConstruct;

@Configuration
public class MinioConfig {

    @Value("${minio.endpoint}")
    private String endpoint;  // http://127.0.0.1:9010
    @Value("${minio.access-key}")
    private String accessKey;
    @Value("${minio.secret-key}")
    private String secretKey;
    @Value("${minio.bucket}")
    private String bucket;

    @Bean
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }

    @PostConstruct
    public void ensureBucket() throws Exception {
        MinioClient client = minioClient();
        if (!client.bucketExists(io.minio.BucketExistsArgs.builder().bucket(bucket).build())) {
            client.makeBucket(io.minio.MakeBucketArgs.builder().bucket(bucket).build());
        }
    }

    public String getBucket() { return bucket; }
}
```

### 4. 请求/响应 DTO

```java
// dto/UploadInitRequest.java
@Data
public class UploadInitRequest {
    private String fileName;
    private Long fileSize;
}

// dto/UploadCompleteRequest.java
@Data
public class UploadCompleteRequest {
    private String uploadId;
    private String modelName;
    private String version;
    private String type;
    private String remark;
}

// 统一响应格式（与前端约定）
@Data
public class ApiResponse<T> {
    private boolean success = true;
    private T data;
    private String errorMessage;
    public static <T> ApiResponse<T> ok(T data) {
        ApiResponse<T> r = new ApiResponse<>();
        r.setData(data);
        return r;
    }
}
```

### 5. 上传会话（内存，生产建议 Redis）

```java
// model/UploadSession.java
@Data
public class UploadSession {
    private String fileName;
    private long fileSize;
    private final List<String> partEtags = Collections.synchronizedList(new ArrayList<>());
}
```

### 6. 分片上传接口

```java
// controller/ModelUploadController.java
package com.example.controller;

import com.example.config.MinioConfig;
import com.example.dto.*;
import com.example.model.UploadSession;
import io.minio.*;
import io.minio.ComposeObjectArgs;
import io.minio.ComposeSource;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/model/upload")
public class ModelUploadController {

    private final MinioClient minioClient;
    private final String bucket;
    private static final int CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    private final Map<String, UploadSession> uploadSessions = new ConcurrentHashMap<>();

    public ModelUploadController(MinioClient minioClient, MinioConfig minioConfig) {
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
    }

    @PostMapping("/init")
    public ApiResponse<Map<String, Object>> init(@RequestBody UploadInitRequest req) {
        String uploadId = "upload-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().replace("-", "");
        UploadSession session = new UploadSession();
        session.setFileName(req.getFileName());
        session.setFileSize(req.getFileSize() != null ? req.getFileSize() : 0L);
        uploadSessions.put(uploadId, session);
        Map<String, Object> data = new HashMap<>();
        data.put("uploadId", uploadId);
        data.put("chunkSize", CHUNK_SIZE);
        return ApiResponse.ok(data);
    }

    @PostMapping("/chunk")
    public ApiResponse<Map<String, String>> chunk(
            @RequestParam String uploadId,
            @RequestParam Integer partIndex,
            @RequestParam("file") MultipartFile file) throws Exception {
        UploadSession session = uploadSessions.get(uploadId);
        if (session == null) {
            ApiResponse<Map<String, String>> err = new ApiResponse<>();
            err.setSuccess(false);
            err.setErrorMessage("uploadId 无效");
            return err;
        }
        String objectName = "models/" + uploadId + "/" + partIndex;
        try (InputStream is = file.getInputStream()) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucket)
                            .object(objectName)
                            .stream(is, file.getSize(), -1)
                            .build());
        }
        // 记录 part 顺序（支持乱序上传），complete 时按 partIndex 顺序合并
        synchronized (session.getPartEtags()) {
            while (session.getPartEtags().size() <= partIndex) {
                session.getPartEtags().add(null);
            }
            session.getPartEtags().set(partIndex, objectName);
        }
        return ApiResponse.ok(Collections.singletonMap("etag", objectName));
    }

    @PostMapping("/complete")
    public ApiResponse<Map<String, Object>> complete(@RequestBody UploadCompleteRequest req) throws Exception {
        UploadSession session = uploadSessions.remove(req.getUploadId());
        if (session == null) {
            ApiResponse<Map<String, Object>> err = new ApiResponse<>();
            err.setSuccess(false);
            err.setErrorMessage("uploadId 无效");
            return err;
        }
        String destName = "models/" + req.getModelName() + "/" + req.getVersion() + "/" + session.getFileName();
        List<ComposeSource> sources = new ArrayList<>();
        for (int i = 0; i < session.getPartEtags().size(); i++) {
            String partObject = session.getPartEtags().get(i);
            sources.add(ComposeSource.builder().bucket(bucket).object(partObject).build());
        }
        minioClient.composeObject(
                ComposeObjectArgs.builder()
                        .bucket(bucket)
                        .object(destName)
                        .sources(sources)
                        .build());
        // 删除临时分片对象（可选）
        for (ComposeSource src : sources) {
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(src.object()).build());
        }
        // 落库：保存 modelName, version, type, remark, storagePath=destName
        Map<String, Object> data = new HashMap<>();
        data.put("id", "new-model-id");
        data.put("name", req.getModelName());
        data.put("version", req.getVersion());
        data.put("type", req.getType());
        data.put("remark", req.getRemark());
        data.put("storagePath", destName);
        return ApiResponse.ok(data);
    }
}
```

说明：`ComposeSource`、`ComposeObjectArgs` 为 MinIO Java SDK 8.x 的 API；若你用的 7.x，需改为 `minioClient.composeObject(bucket, destName, sources)` 等对应写法。  
启动后端后，把前端代理的 `target` 指到该服务（如 `http://127.0.0.1:8080`）即可。

---

## 二、Node.js 示例（Express）

### 1. 依赖

```bash
npm install express multer minio
```

### 2. MinIO 客户端与上传状态存储

```javascript
// minioClient.js
const { Client } = require('minio');

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
  port: parseInt(process.env.MINIO_PORT || '9010', 10),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
  secretKey: process.env.MINIO_SECRET_KEY || 'password123',
});

const BUCKET = process.env.MINIO_BUCKET || 'models';

async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) await minioClient.makeBucket(BUCKET);
}

module.exports = { minioClient, BUCKET, ensureBucket };
```

### 3. 分片上传接口（与前端约定一致）

```javascript
// 内存中暂存 uploadId -> 分片信息（生产建议用 Redis）
const uploadSessions = new Map();

// POST /api/model/upload/init
// Body: { fileName, fileSize }
app.post('/api/model/upload/init', (req, res) => {
  const { fileName, fileSize } = req.body;
  const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  uploadSessions.set(uploadId, {
    fileName,
    fileSize,
    parts: [], // 存各 part 的 etag，complete 时合并
  });
  res.json({
    success: true,
    data: { uploadId, chunkSize: 5 * 1024 * 1024 },
  });
});

// POST /api/model/upload/chunk
// FormData: uploadId, partIndex, file
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/model/upload/chunk', upload.single('file'), async (req, res) => {
  const { uploadId, partIndex } = req.body;
  const file = req.file;
  if (!uploadId || partIndex === undefined || !file) {
    return res.status(400).json({ success: false, errorMessage: '缺少参数' });
  }
  const session = uploadSessions.get(uploadId);
  if (!session) return res.status(404).json({ success: false, errorMessage: 'uploadId 无效' });

  const objectName = `models/${uploadId}/${partIndex}`;
  const result = await minioClient.putObject(BUCKET, objectName, file.buffer, file.size);
  session.parts[parseInt(partIndex, 10)] = result.etag;

  res.json({ success: true, data: { etag: result.etag } });
});

// POST /api/model/upload/complete
// Body: { uploadId, modelName, version, type, remark }
app.post('/api/model/upload/complete', async (req, res) => {
  const { uploadId, modelName, version, type, remark } = req.body;
  const session = uploadSessions.get(uploadId);
  if (!session) return res.status(404).json({ success: false, errorMessage: 'uploadId 无效' });

  const { fileName, parts } = session;
  // 合并：按 partIndex 顺序把各分片 compose 成一个对象（或先流式合并再 putObject）
  const destName = `models/${modelName}/${version}/${fileName}`;
  const sources = parts.map((_, i) => ({ bucket: BUCKET, object: `models/${uploadId}/${i}` }));

  await minioClient.composeObject(destName, sources);
  uploadSessions.delete(uploadId);

  // 这里落库：把 destName、modelName、version、type、remark 写入你的数据库
  // const modelRecord = await db.models.create({ ... });

  res.json({
    success: true,
    data: {
      id: 'new-model-id',
      name: modelName,
      version,
      type,
      remark,
      storagePath: destName,
    },
  });
});
```

启动前调用一次 `ensureBucket()`。生产环境建议用 Redis 存 `uploadSessions`，并做好过期清理。

---

## 二、Python 示例（FastAPI）

### 1. 依赖

```bash
pip install fastapi uvicorn minio python-multipart
```

### 2. MinIO 客户端与配置

```python
# minio_client.py
from minio import Minio
import os

minio_client = Minio(
    "127.0.0.1:9010",
    access_key=os.getenv("MINIO_ACCESS_KEY", "admin"),
    secret_key=os.getenv("MINIO_SECRET_KEY", "password123"),
    secure=False,
)
BUCKET = os.getenv("MINIO_BUCKET", "models")

def ensure_bucket():
    if not minio_client.bucket_exists(BUCKET):
        minio_client.make_bucket(BUCKET)
```

### 3. 分片上传接口

```python
# main.py
from fastapi import FastAPI, UploadFile, File, Form
from minio_client import minio_client, BUCKET, ensure_bucket
import io
import uuid

app = FastAPI()
upload_sessions = {}  # 生产建议用 Redis

@app.on_event("startup")
def startup():
    ensure_bucket()

@app.post("/api/model/upload/init")
def upload_init(body: dict):
    fileName = body.get("fileName")
    fileSize = body.get("fileSize")
    upload_id = f"upload-{uuid.uuid4().hex}"
    upload_sessions[upload_id] = {"fileName": fileName, "fileSize": fileSize, "parts": {}}
    return {"success": True, "data": {"uploadId": upload_id, "chunkSize": 5 * 1024 * 1024}}

@app.post("/api/model/upload/chunk")
async def upload_chunk(
    uploadId: str = Form(...),
    partIndex: str = Form(...),
    file: UploadFile = File(...),
):
    if uploadId not in upload_sessions:
        return {"success": False, "errorMessage": "uploadId 无效"}
    data = await file.read()
    object_name = f"models/{uploadId}/{partIndex}"
    minio_client.put_object(BUCKET, object_name, io.BytesIO(data), len(data))
    upload_sessions[uploadId]["parts"][int(partIndex)] = object_name
    return {"success": True, "data": {}}

@app.post("/api/model/upload/complete")
def upload_complete(body: dict):
    upload_id = body.get("uploadId")
    model_name = body.get("modelName")
    version = body.get("version")
    type_ = body.get("type")
    remark = body.get("remark")
    if upload_id not in upload_sessions:
        return {"success": False, "errorMessage": "uploadId 无效"}
    session = upload_sessions[upload_id]
    fileName = session["fileName"]
    parts = session["parts"]
    dest_name = f"models/{model_name}/{version}/{fileName}"
    # 合并：按 partIndex 顺序 compose 成最终对象
    from minio.commonconfig import ComposeSource
    sources = [ComposeSource(BUCKET, f"models/{upload_id}/{i}") for i in sorted(parts.keys())]
    minio_client.compose_object(BUCKET, dest_name, sources)
    del upload_sessions[upload_id]
    # 落库：保存 model_name, version, type_, remark, storage_path=dest_name
    return {
        "success": True,
        "data": {
            "id": "new-model-id",
            "name": model_name,
            "version": version,
            "type": type_,
            "remark": remark,
            "storagePath": dest_name,
        },
    }
```

运行：`uvicorn main:app --reload --port 8080`。  
前端代理到 `http://127.0.0.1:8080` 即可。

---

## 三、接口约定小结（与前端一致）

| 接口 | 方法 | 请求 | 响应 |
|------|------|------|------|
| `/api/model/upload/init` | POST | `{ fileName, fileSize }` | `{ data: { uploadId, chunkSize? } }` |
| `/api/model/upload/chunk` | POST | FormData: `uploadId`, `partIndex`, `file` | `{ data?: { etag? } }` |
| `/api/model/upload/complete` | POST | `{ uploadId, modelName, version, type, remark }` | `{ data: ModelItem }` |

按你实际使用的语言把上述逻辑接到现有后端即可；若后端是 Java/Go，可再补对应示例。
