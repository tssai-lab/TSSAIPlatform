package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.ModelCurrentVersionRequest;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.model.TaskType;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.service.ModelVersionLifecycleService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/model-assets")
public class ModelAssetCrudController {

    private final ModelAssetRepository repo;
    private final AuthContext authContext;
    private final ModelVersionLifecycleService lifecycleService;

    public ModelAssetCrudController(
            ModelAssetRepository repo,
            AuthContext authContext,
            ModelVersionLifecycleService lifecycleService
    ) {
        this.repo = repo;
        this.authContext = authContext;
        this.lifecycleService = lifecycleService;
    }

    @PostMapping
    public ApiResponse<ModelAsset> create(@RequestBody ModelAsset body) {
        try {
            body.setType(TaskType.normalize(body.getType()));
            body.setId("model-asset-" + UUID.randomUUID().toString().replace("-", ""));
            body.setCurrentVersionId(null);
            body.setOwnerUserId(authContext.currentUserId());
            body.setCreatedAt(Instant.now());
            body.setUpdatedAt(Instant.now());
            body.setDeleted(false);
            body.setDeletedAt(null);
            return ApiResponse.ok(repo.save(body));
        } catch (IllegalArgumentException exception) {
            return ApiResponse.fail(exception.getMessage());
        }
    }

    @GetMapping("/{id}")
    public ApiResponse<ModelAsset> get(@PathVariable String id) {
        Optional<ModelAsset> found = repo.findByIdAndDeletedFalse(id);
        if (found.isEmpty() || !authContext.canAccessOwner(found.get().getOwnerUserId())) {
            return ApiResponse.fail("not found or no permission: " + id);
        }
        return ApiResponse.ok(found.get());
    }

    @GetMapping
    public ApiResponse<List<ModelAsset>> list() {
        if (authContext.isAdmin()) {
            return ApiResponse.ok(repo.findByDeletedFalse());
        }
        return ApiResponse.ok(
                repo.findByOwnerUserIdAndDeletedFalse(authContext.currentUserId())
        );
    }

    @PutMapping("/{id}")
    public ApiResponse<ModelAsset> update(
            @PathVariable String id,
            @RequestBody ModelAsset body
    ) {
        Optional<ModelAsset> existing = repo.findByIdAndDeletedFalse(id);
        if (existing.isEmpty()) {
            return ApiResponse.fail("未找到: " + id);
        }
        ModelAsset asset = existing.get();
        if (!authContext.canAccessOwner(asset.getOwnerUserId())) {
            return ApiResponse.fail("no permission: " + id);
        }
        asset.setName(body.getName());
        try {
            asset.setType(TaskType.normalize(body.getType()));
        } catch (IllegalArgumentException exception) {
            return ApiResponse.fail(exception.getMessage());
        }
        asset.setRemark(body.getRemark());
        asset.setUpdatedAt(Instant.now());
        return ApiResponse.ok(repo.save(asset));
    }

    @PutMapping("/{id}/current-version")
    public ApiResponse<ModelAsset> switchCurrent(
            @PathVariable String id,
            @RequestBody ModelCurrentVersionRequest body
    ) {
        if (body == null || body.getVersionId() == null || body.getVersionId().isBlank()) {
            return ApiResponse.fail("versionId cannot be empty");
        }
        try {
            return ApiResponse.ok(lifecycleService.switchCurrent(id, body.getVersionId().trim()));
        } catch (IllegalArgumentException exception) {
            return ApiResponse.fail(exception.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Map<String, Object>> delete(@PathVariable String id) {
        try {
            return ApiResponse.ok(lifecycleService.deleteAsset(id));
        } catch (IllegalArgumentException exception) {
            return ApiResponse.fail(exception.getMessage());
        }
    }
}
