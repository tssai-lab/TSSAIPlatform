package com.tss.platform.controller;

import com.tss.platform.config.MinioConfig;
import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.UploadCompleteRequest;
import com.tss.platform.dto.UploadInitRequest;
import com.tss.platform.model.UploadSession;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import io.minio.*;
import io.minio.ComposeObjectArgs;
import io.minio.ComposeSource;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/model/upload")
public class ModelUploadController {

    private static final int CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

    private final MinioClient minioClient;
    private final String bucket;
    private final ModelAssetRepository modelAssetRepo;
    private final ModelVersionRepository modelVersionRepo;
    private final Map<String, UploadSession> uploadSessions = new ConcurrentHashMap<>();

    public ModelUploadController(MinioClient minioClient, MinioConfig minioConfig,
                                 ModelAssetRepository modelAssetRepo,
                                 ModelVersionRepository modelVersionRepo) {
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
        this.modelAssetRepo = modelAssetRepo;
        this.modelVersionRepo = modelVersionRepo;
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
        // 1) 落库：资产
        ModelAsset asset = new ModelAsset();
        asset.setId("model-asset-" + UUID.randomUUID().toString().replace("-", ""));
        asset.setName(req.getModelName());
        asset.setType(req.getType());
        asset.setRemark(req.getRemark());
        asset.setCreatedAt(Instant.now());
        asset.setUpdatedAt(Instant.now());
        modelAssetRepo.save(asset);

        // 2) 落库：版本
        ModelVersion ver = new ModelVersion();
        ver.setId("model-ver-" + UUID.randomUUID().toString().replace("-", ""));
        ver.setAssetId(asset.getId());
        ver.setVersion(req.getVersion());
        ver.setFileName(session.getFileName());
        ver.setStoragePath(destName);
        ver.setSizeBytes(session.getFileSize());
        ver.setCreatedAt(Instant.now());
        modelVersionRepo.save(ver);

        Map<String, Object> data = new HashMap<>();
        data.put("id", ver.getId());
        data.put("name", asset.getName());
        data.put("version", ver.getVersion());
        data.put("type", asset.getType());
        data.put("remark", asset.getRemark());
        data.put("storagePath", ver.getStoragePath());
        data.put("createdAt", ver.getCreatedAt());
        return ApiResponse.ok(data);
    }
}
