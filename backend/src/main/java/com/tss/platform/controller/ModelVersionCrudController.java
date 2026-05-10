package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/model-versions")
public class ModelVersionCrudController {

    private final ModelVersionRepository repo;
    private final ModelAssetRepository assetRepo;
    private final AuthContext authContext;

    public ModelVersionCrudController(
            ModelVersionRepository repo,
            ModelAssetRepository assetRepo,
            AuthContext authContext
    ) {
        this.repo = repo;
        this.assetRepo = assetRepo;
        this.authContext = authContext;
    }

    @PostMapping
    public ApiResponse<ModelVersion> create(@RequestBody ModelVersion body) {
        if (body.getId() == null || body.getId().isBlank()) {
            body.setId("model-ver-" + UUID.randomUUID().toString().replace("-", ""));
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
    public ApiResponse<ModelVersion> get(@PathVariable String id) {
        Optional<ModelVersion> v = repo.findById(id);
        if (v.isEmpty() || !authContext.canAccessOwner(effectiveOwner(v.get()))) {
            return ApiResponse.fail("not found or no permission: " + id);
        }
        return ApiResponse.ok(v.get());
    }

    @GetMapping
    public ApiResponse<List<ModelVersion>> list(@RequestParam(value = "assetId", required = false) String assetId) {
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
    public ApiResponse<ModelVersion> update(@PathVariable String id, @RequestBody ModelVersion body) {
        Optional<ModelVersion> existing = repo.findById(id);
        if (existing.isEmpty()) {
            return ApiResponse.fail("未找到: " + id);
        }
        ModelVersion e = existing.get();
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
        e.setOwnerUserId(ownerUserId != null ? ownerUserId : e.getOwnerUserId());
        return ApiResponse.ok(repo.save(e));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Object> delete(@PathVariable String id) {
        Optional<ModelVersion> existing = repo.findById(id);
        if (existing.isEmpty() || !authContext.canAccessOwner(effectiveOwner(existing.get()))) {
            return ApiResponse.fail("not found or no permission: " + id);
        }
        repo.deleteById(id);
        return ApiResponse.ok(null);
    }

    private Integer resolveAssetOwner(String assetId) {
        if (assetId == null || assetId.isBlank()) {
            return null;
        }
        return assetRepo.findById(assetId).map(ModelAsset::getOwnerUserId).orElse(null);
    }

    private Integer effectiveOwner(ModelVersion version) {
        if (version.getOwnerUserId() != null) {
            return version.getOwnerUserId();
        }
        return resolveAssetOwner(version.getAssetId());
    }
}

