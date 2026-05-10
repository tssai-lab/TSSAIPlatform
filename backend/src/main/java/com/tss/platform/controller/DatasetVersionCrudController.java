package com.tss.platform.controller;

import com.tss.platform.config.MinioConfig;
import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
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
    private final DatasetAssetRepository assetRepo;
    private final MinioClient minioClient;
    private final String bucket;
    private final AuthContext authContext;

    public DatasetVersionCrudController(
            DatasetVersionRepository repo,
            DatasetAssetRepository assetRepo,
            MinioClient minioClient,
            MinioConfig minioConfig,
            AuthContext authContext
    ) {
        this.repo = repo;
        this.assetRepo = assetRepo;
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
        this.authContext = authContext;
    }

    @PostMapping
    public ApiResponse<DatasetVersion> create(@RequestBody DatasetVersion body) {
        if (body.getId() == null || body.getId().isBlank()) {
            body.setId("dataset-ver-" + UUID.randomUUID().toString().replace("-", ""));
        }
        Integer ownerUserId = resolveAssetOwner(body.getAssetId());
        if (!authContext.canAccessOwner(ownerUserId)) {
            return ApiResponse.fail("no permission for asset: " + body.getAssetId());
        }
        body.setOwnerUserId(ownerUserId != null ? ownerUserId : authContext.currentUserId());
        if (body.getCreatedAt() == null) {
            body.setCreatedAt(Instant.now());
        }
        return ApiResponse.ok(repo.save(body));
    }

    @GetMapping("/{id}")
    public ApiResponse<DatasetVersion> get(@PathVariable String id) {
        Optional<DatasetVersion> v = repo.findById(id);
        if (v.isEmpty() || !authContext.canAccessOwner(effectiveOwner(v.get()))) {
            return ApiResponse.fail("not found or no permission: " + id);
        }
        return ApiResponse.ok(v.get());
    }

    @GetMapping
    public ApiResponse<List<DatasetVersion>> list(@RequestParam(value = "assetId", required = false) String assetId) {
        if (assetId != null && !assetId.isBlank()) {
            if (authContext.isAdmin()) {
                return ApiResponse.ok(repo.findByAssetId(assetId));
            }
            return ApiResponse.ok(repo.findByAssetIdAndOwnerUserId(assetId, authContext.currentUserId()));
        }
        if (authContext.isAdmin()) {
            return ApiResponse.ok(repo.findAll());
        }
        return ApiResponse.ok(repo.findByOwnerUserId(authContext.currentUserId()));
    }

    @PutMapping("/{id}")
    public ApiResponse<DatasetVersion> update(@PathVariable String id, @RequestBody DatasetVersion body) {
        Optional<DatasetVersion> existing = repo.findById(id);
        if (existing.isEmpty()) {
            return ApiResponse.fail("未找到: " + id);
        }
        DatasetVersion e = existing.get();
        if (!authContext.canAccessOwner(effectiveOwner(e))) {
            return ApiResponse.fail("no permission: " + id);
        }
        Integer ownerUserId = resolveAssetOwner(body.getAssetId());
        if (!authContext.canAccessOwner(ownerUserId)) {
            return ApiResponse.fail("no permission for asset: " + body.getAssetId());
        }
        e.setAssetId(body.getAssetId());
        e.setVersion(body.getVersion());
        e.setFileName(body.getFileName());
        e.setStoragePath(body.getStoragePath());
        e.setSizeBytes(body.getSizeBytes());
        e.setRemark(body.getRemark());
        e.setOwnerUserId(ownerUserId != null ? ownerUserId : e.getOwnerUserId());
        return ApiResponse.ok(repo.save(e));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ApiResponse<Map<String, Object>> delete(@PathVariable String id) {
        Optional<DatasetVersion> existing = repo.findById(id);
        if (existing.isEmpty() || !authContext.canAccessOwner(effectiveOwner(existing.get()))) {
            return ApiResponse.fail("not found or no permission: " + id);
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

    private Integer resolveAssetOwner(String assetId) {
        if (assetId == null || assetId.isBlank()) {
            return null;
        }
        return assetRepo.findById(assetId).map(DatasetAsset::getOwnerUserId).orElse(null);
    }

    private Integer effectiveOwner(DatasetVersion version) {
        if (version.getOwnerUserId() != null) {
            return version.getOwnerUserId();
        }
        return resolveAssetOwner(version.getAssetId());
    }
}

