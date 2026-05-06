package com.tss.platform.controller;

import com.tss.platform.config.MinioConfig;
import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.model.TaskType;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import io.minio.MinioClient;
import io.minio.RemoveObjectArgs;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/dataset-assets")
public class DatasetAssetCrudController {

    private final DatasetAssetRepository repo;
    private final DatasetVersionRepository versionRepo;
    private final MinioClient minioClient;
    private final String bucket;

    public DatasetAssetCrudController(
            DatasetAssetRepository repo,
            DatasetVersionRepository versionRepo,
            MinioClient minioClient,
            MinioConfig minioConfig
    ) {
        this.repo = repo;
        this.versionRepo = versionRepo;
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
    }

    @PostMapping
    public ApiResponse<DatasetAsset> create(@RequestBody DatasetAsset body) {
        try {
            body.setType(TaskType.normalize(body.getType()));
            if (body.getId() == null || body.getId().isBlank()) {
                body.setId("dataset-asset-" + UUID.randomUUID().toString().replace("-", ""));
            }
            if (body.getCreatedAt() == null) {
                body.setCreatedAt(Instant.now());
            }
            body.setUpdatedAt(Instant.now());
            return ApiResponse.ok(repo.save(body));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}")
    public ApiResponse<DatasetAsset> get(@PathVariable String id) {
        Optional<DatasetAsset> v = repo.findById(id);
        return v.map(ApiResponse::ok).orElseGet(() -> ApiResponse.fail("未找到: " + id));
    }

    @GetMapping
    public ApiResponse<List<DatasetAsset>> list() {
        return ApiResponse.ok(repo.findAll());
    }

    @PutMapping("/{id}")
    public ApiResponse<DatasetAsset> update(@PathVariable String id, @RequestBody DatasetAsset body) {
        Optional<DatasetAsset> existing = repo.findById(id);
        if (existing.isEmpty()) {
            return ApiResponse.fail("未找到: " + id);
        }
        DatasetAsset e = existing.get();
        e.setName(body.getName());
        try {
            e.setType(TaskType.normalize(body.getType()));
        } catch (IllegalArgumentException ex) {
            return ApiResponse.fail(ex.getMessage());
        }
        e.setRemark(body.getRemark());
        e.setUpdatedAt(Instant.now());
        return ApiResponse.ok(repo.save(e));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ApiResponse<Map<String, Object>> delete(@PathVariable String id) {
        Optional<DatasetAsset> existing = repo.findById(id);
        if (existing.isEmpty()) {
            return ApiResponse.fail("未找到: " + id);
        }

        List<DatasetVersion> versions = versionRepo.findByAssetId(id);
        LinkedHashSet<String> objectNames = new LinkedHashSet<>();
        for (DatasetVersion version : versions) {
            String storagePath = version.getStoragePath();
            if (storagePath != null && !storagePath.isBlank()) {
                objectNames.add(storagePath);
            }
        }

        try {
            for (String objectName : objectNames) {
                minioClient.removeObject(
                        RemoveObjectArgs.builder()
                                .bucket(bucket)
                                .object(objectName)
                                .build()
                );
            }
        } catch (Exception e) {
            return ApiResponse.fail("删除数据集文件失败: " + e.getMessage());
        }

        versionRepo.deleteAll(versions);
        repo.delete(existing.get());

        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("deletedVersions", versions.size());
        result.put("deletedObjects", objectNames.size());
        return ApiResponse.ok(result);
    }
}

