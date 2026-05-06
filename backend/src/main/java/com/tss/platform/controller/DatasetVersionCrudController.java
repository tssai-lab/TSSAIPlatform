package com.tss.platform.controller;

import com.tss.platform.config.MinioConfig;
import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.repository.DatasetVersionRepository;
import io.minio.MinioClient;
import io.minio.RemoveObjectArgs;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/dataset-versions")
public class DatasetVersionCrudController {

    private final DatasetVersionRepository repo;
    private final MinioClient minioClient;
    private final String bucket;

    public DatasetVersionCrudController(
            DatasetVersionRepository repo,
            MinioClient minioClient,
            MinioConfig minioConfig
    ) {
        this.repo = repo;
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
    }

    @PostMapping
    public ApiResponse<DatasetVersion> create(@RequestBody DatasetVersion body) {
        if (body.getId() == null || body.getId().isBlank()) {
            body.setId("dataset-ver-" + UUID.randomUUID().toString().replace("-", ""));
        }
        if (body.getCreatedAt() == null) {
            body.setCreatedAt(Instant.now());
        }
        return ApiResponse.ok(repo.save(body));
    }

    @GetMapping("/{id}")
    public ApiResponse<DatasetVersion> get(@PathVariable String id) {
        Optional<DatasetVersion> v = repo.findById(id);
        return v.map(ApiResponse::ok).orElseGet(() -> ApiResponse.fail("未找到: " + id));
    }

    @GetMapping
    public ApiResponse<List<DatasetVersion>> list(@RequestParam(value = "assetId", required = false) String assetId) {
        if (assetId != null && !assetId.isBlank()) {
            return ApiResponse.ok(repo.findByAssetId(assetId));
        }
        return ApiResponse.ok(repo.findAll());
    }

    @PutMapping("/{id}")
    public ApiResponse<DatasetVersion> update(@PathVariable String id, @RequestBody DatasetVersion body) {
        Optional<DatasetVersion> existing = repo.findById(id);
        if (existing.isEmpty()) {
            return ApiResponse.fail("未找到: " + id);
        }
        DatasetVersion e = existing.get();
        e.setAssetId(body.getAssetId());
        e.setVersion(body.getVersion());
        e.setFileName(body.getFileName());
        e.setStoragePath(body.getStoragePath());
        e.setSizeBytes(body.getSizeBytes());
        e.setRemark(body.getRemark());
        return ApiResponse.ok(repo.save(e));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ApiResponse<Map<String, Object>> delete(@PathVariable String id) {
        Optional<DatasetVersion> existing = repo.findById(id);
        if (existing.isEmpty()) {
            return ApiResponse.fail("未找到: " + id);
        }
        DatasetVersion version = existing.get();
        boolean deletedObject = false;
        String objectName = version.getStoragePath();
        if (objectName != null && !objectName.isBlank()) {
            try {
                minioClient.removeObject(
                        RemoveObjectArgs.builder()
                                .bucket(bucket)
                                .object(objectName)
                                .build()
                );
                deletedObject = true;
            } catch (Exception e) {
                return ApiResponse.fail("删除数据集版本文件失败: " + e.getMessage());
            }
        }

        repo.delete(version);

        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("assetId", version.getAssetId());
        result.put("deletedObject", deletedObject);
        return ApiResponse.ok(result);
    }
}

