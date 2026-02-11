package com.tss.platform.controller;

import com.tss.platform.config.MinioConfig;
import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.UploadCompleteRequest;
import com.tss.platform.dto.UploadInitRequest;
import com.tss.platform.model.ModelRecord;
import com.tss.platform.model.UploadSession;
import com.tss.platform.service.ModelStoreService;
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

    private static final int CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

    private final MinioClient minioClient;
    private final String bucket;
    private final ModelStoreService modelStore;
    private final Map<String, UploadSession> uploadSessions = new ConcurrentHashMap<>();

    public ModelUploadController(MinioClient minioClient, MinioConfig minioConfig,
                                 ModelStoreService modelStore) {
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
        this.modelStore = modelStore;
    }

    @PostMapping("/init")
    public ApiResponse<Map<String, Object>> init(@RequestBody UploadInitRequest req) {
        String uploadId = "upload-" + System.currentTimeMillis() + "-"
                + UUID.randomUUID().toString().replace("-", "");
        UploadSession session = new UploadSession();
        session.setFileName(req.getFileName() != null ? req.getFileName() : "");
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
            @RequestParam("file") MultipartFile file) {
        UploadSession session = uploadSessions.get(uploadId);
        if (session == null) {
            return ApiResponse.fail("uploadId 无效");
        }
        String objectName = "models/" + uploadId + "/" + partIndex;
        try (InputStream is = file.getInputStream()) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucket)
                            .object(objectName)
                            .stream(is, file.getSize(), -1)
                            .build());
        } catch (Exception e) {
            return ApiResponse.fail("分片上传失败: " + e.getMessage());
        }
        synchronized (session.getPartObjectNames()) {
            while (session.getPartObjectNames().size() <= partIndex) {
                session.getPartObjectNames().add(null);
            }
            session.getPartObjectNames().set(partIndex, objectName);
        }
        return ApiResponse.ok(Collections.singletonMap("etag", objectName));
    }

    @PostMapping("/complete")
    public ApiResponse<Map<String, Object>> complete(@RequestBody UploadCompleteRequest req) {
        UploadSession session = uploadSessions.remove(req.getUploadId());
        if (session == null) {
            return ApiResponse.fail("uploadId 无效");
        }
        String destName = "models/" + req.getModelName() + "/" + req.getVersion()
                + "/" + session.getFileName();
        try {
            List<ComposeSource> sources = new ArrayList<>();
            for (String partObject : session.getPartObjectNames()) {
                if (partObject != null) {
                    sources.add(ComposeSource.builder()
                            .bucket(bucket)
                            .object(partObject)
                            .build());
                }
            }
            minioClient.composeObject(
                    ComposeObjectArgs.builder()
                            .bucket(bucket)
                            .object(destName)
                            .sources(sources)
                            .build());
            // 删除临时分片
            for (String partObject : session.getPartObjectNames()) {
                if (partObject != null) {
                    minioClient.removeObject(
                            RemoveObjectArgs.builder().bucket(bucket).object(partObject).build());
                }
            }
        } catch (Exception e) {
            return ApiResponse.fail("合并文件失败: " + e.getMessage());
        }
        ModelRecord record = ModelRecord.of(
                null, req.getModelName(), req.getVersion(), req.getType(),
                req.getRemark(), destName);
        modelStore.save(record);
        Map<String, Object> data = new HashMap<>();
        data.put("id", record.getId());
        data.put("name", record.getName());
        data.put("version", record.getVersion());
        data.put("type", record.getType());
        data.put("remark", record.getRemark());
        data.put("storagePath", record.getStoragePath());
        data.put("createdAt", record.getCreatedAt());
        return ApiResponse.ok(data);
    }
}
