package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.model.TaskType;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.service.MinioDeleteTaskService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
@RequestMapping("/api/model-assets")
public class ModelAssetCrudController {

    private static final Logger log = LoggerFactory.getLogger(ModelAssetCrudController.class);

    private final ModelAssetRepository repo;
    private final ModelVersionRepository versionRepo;
    private final TrainingExperimentVersionRepository trainingRepo;
    private final MinioDeleteTaskService minioDeleteTaskService;
    private final AuthContext authContext;

    public ModelAssetCrudController(
            ModelAssetRepository repo,
            ModelVersionRepository versionRepo,
            TrainingExperimentVersionRepository trainingRepo,
            MinioDeleteTaskService minioDeleteTaskService,
            AuthContext authContext
    ) {
        this.repo = repo;
        this.versionRepo = versionRepo;
        this.trainingRepo = trainingRepo;
        this.minioDeleteTaskService = minioDeleteTaskService;
        this.authContext = authContext;
    }

    @PostMapping
    public ApiResponse<ModelAsset> create(@RequestBody ModelAsset body) {
        try {
            body.setType(TaskType.normalize(body.getType()));
            body.setId("model-asset-" + UUID.randomUUID().toString().replace("-", ""));
            body.setOwnerUserId(authContext.currentUserId());
            if (body.getCreatedAt() == null) {
                body.setCreatedAt(Instant.now());
            }
            body.setUpdatedAt(Instant.now());
            body.setDeleted(false);
            body.setDeletedAt(null);
            return ApiResponse.ok(repo.save(body));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}")
    public ApiResponse<ModelAsset> get(@PathVariable String id) {
        Optional<ModelAsset> v = repo.findByIdAndDeletedFalse(id);
        if (v.isEmpty() || !authContext.canAccessOwner(v.get().getOwnerUserId())) {
            return ApiResponse.fail("not found or no permission: " + id);
        }
        return ApiResponse.ok(v.get());
    }

    @GetMapping
    public ApiResponse<List<ModelAsset>> list() {
        if (authContext.isAdmin()) {
            return ApiResponse.ok(repo.findByDeletedFalse());
        }
        return ApiResponse.ok(repo.findByOwnerUserIdAndDeletedFalse(authContext.currentUserId()));
    }

    @PutMapping("/{id}")
    public ApiResponse<ModelAsset> update(@PathVariable String id, @RequestBody ModelAsset body) {
        Optional<ModelAsset> existing = repo.findByIdAndDeletedFalse(id);
        if (existing.isEmpty()) {
            return ApiResponse.fail("未找到: " + id);
        }
        ModelAsset e = existing.get();
        if (!authContext.canAccessOwner(e.getOwnerUserId())) {
            return ApiResponse.fail("no permission: " + id);
        }
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
        Optional<ModelAsset> existing = repo.findByIdAndDeletedFalse(id);
        if (existing.isEmpty() || !authContext.canAccessOwner(existing.get().getOwnerUserId())) {
            return ApiResponse.fail("not found or no permission: " + id);
        }
        ModelAsset asset = existing.get();
        List<ModelVersion> versions = versionRepo.findByAssetId(id);
        List<String> versionIds = versions.stream().map(ModelVersion::getId).toList();
        if (!versionIds.isEmpty() && trainingRepo.countByModelVersionIdIn(versionIds) > 0) {
            log.warn("Reject model asset delete because versions are referenced by training experiments: id={}", id);
            return ApiResponse.fail("model asset has versions referenced by training experiments");
        }
        LinkedHashSet<String> objectNames = new LinkedHashSet<>();
        for (ModelVersion version : versions) {
            if (Boolean.TRUE.equals(version.getDeleted())) {
                continue;
            }
            String storagePath = version.getStoragePath();
            if (storagePath != null && !storagePath.isBlank()) {
                objectNames.add(storagePath);
            }
        }

        try {
            for (String objectName : objectNames) {
                authContext.requireObjectAccess(objectName, asset.getOwnerUserId(), "object not found or no permission");
                minioDeleteTaskService.enqueueDefaultBucketDelete(
                        objectName,
                        MinioDeleteTaskService.SOURCE_MODEL_ASSET,
                        id,
                        asset.getOwnerUserId()
                );
            }
        } catch (Exception e) {
            log.warn("Reject model asset delete because MinIO delete task cannot be queued: id={}, error={}", id, e.getMessage());
            return ApiResponse.fail("创建模型文件删除任务失败: " + e.getMessage());
        }

        Instant now = Instant.now();
        int deletedVersions = 0;
        for (ModelVersion version : versions) {
            if (!Boolean.TRUE.equals(version.getDeleted())) {
                version.setDeleted(true);
                version.setDeletedAt(now);
                deletedVersions += 1;
            }
        }
        versionRepo.saveAll(versions);
        asset.setDeleted(true);
        asset.setDeletedAt(now);
        asset.setUpdatedAt(now);
        repo.save(asset);
        log.info(
                "Model asset soft deleted: id={}, deletedVersions={}, queuedObjects={}, ownerUserId={}",
                id,
                deletedVersions,
                objectNames.size(),
                asset.getOwnerUserId()
        );

        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("deletedVersions", deletedVersions);
        result.put("deleted", true);
        result.put("minioDeleteQueued", objectNames.size());
        return ApiResponse.ok(result);
    }
}

