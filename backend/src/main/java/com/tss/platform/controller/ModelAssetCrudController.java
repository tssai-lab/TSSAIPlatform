package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.model.TaskType;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/model-assets")
public class ModelAssetCrudController {

    private final ModelAssetRepository repo;
    private final AuthContext authContext;

    public ModelAssetCrudController(ModelAssetRepository repo, AuthContext authContext) {
        this.repo = repo;
        this.authContext = authContext;
    }

    @PostMapping
    public ApiResponse<ModelAsset> create(@RequestBody ModelAsset body) {
        try {
            body.setType(TaskType.normalize(body.getType()));
            if (body.getId() == null || body.getId().isBlank()) {
                body.setId("model-asset-" + UUID.randomUUID().toString().replace("-", ""));
            }
            body.setOwnerUserId(authContext.currentUserId());
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
    public ApiResponse<ModelAsset> get(@PathVariable String id) {
        Optional<ModelAsset> v = repo.findById(id);
        if (v.isEmpty() || !authContext.canAccessOwner(v.get().getOwnerUserId())) {
            return ApiResponse.fail("not found or no permission: " + id);
        }
        return ApiResponse.ok(v.get());
    }

    @GetMapping
    public ApiResponse<List<ModelAsset>> list() {
        if (authContext.isAdmin()) {
            return ApiResponse.ok(repo.findAll());
        }
        return ApiResponse.ok(repo.findByOwnerUserId(authContext.currentUserId()));
    }

    @PutMapping("/{id}")
    public ApiResponse<ModelAsset> update(@PathVariable String id, @RequestBody ModelAsset body) {
        Optional<ModelAsset> existing = repo.findById(id);
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
    public ApiResponse<Object> delete(@PathVariable String id) {
        Optional<ModelAsset> existing = repo.findById(id);
        if (existing.isEmpty() || !authContext.canAccessOwner(existing.get().getOwnerUserId())) {
            return ApiResponse.fail("not found or no permission: " + id);
        }
        repo.deleteById(id);
        return ApiResponse.ok(null);
    }
}

