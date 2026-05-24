package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.ModelVersionRepository;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/model-versions")
public class ModelVersionCrudController {

    private final ModelVersionRepository repo;

    public ModelVersionCrudController(ModelVersionRepository repo) {
        this.repo = repo;
    }

    @PostMapping
    public ApiResponse<ModelVersion> create(@RequestBody ModelVersion body) {
        if (body.getId() == null || body.getId().isBlank()) {
            body.setId("model-ver-" + UUID.randomUUID().toString().replace("-", ""));
        }
        if (body.getCreatedAt() == null) {
            body.setCreatedAt(Instant.now());
        }
        return ApiResponse.ok(repo.save(body));
    }

    @GetMapping("/{id}")
    public ApiResponse<ModelVersion> get(@PathVariable String id) {
        Optional<ModelVersion> v = repo.findById(id);
        return v.map(ApiResponse::ok).orElseGet(() -> ApiResponse.fail("未找到: " + id));
    }

    @GetMapping
    public ApiResponse<List<ModelVersion>> list(@RequestParam(value = "assetId", required = false) String assetId) {
        if (assetId != null && !assetId.isBlank()) {
            return ApiResponse.ok(repo.findByAssetId(assetId));
        }
        return ApiResponse.ok(repo.findAll());
    }

    @PutMapping("/{id}")
    public ApiResponse<ModelVersion> update(@PathVariable String id, @RequestBody ModelVersion body) {
        Optional<ModelVersion> existing = repo.findById(id);
        if (existing.isEmpty()) {
            return ApiResponse.fail("未找到: " + id);
        }
        ModelVersion e = existing.get();
        e.setAssetId(body.getAssetId());
        e.setVersion(body.getVersion());
        e.setFileName(body.getFileName());
        e.setStoragePath(body.getStoragePath());
        e.setSizeBytes(body.getSizeBytes());
        return ApiResponse.ok(repo.save(e));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Object> delete(@PathVariable String id) {
        if (!repo.existsById(id)) {
            return ApiResponse.fail("未找到: " + id);
        }
        repo.deleteById(id);
        return ApiResponse.ok(null);
    }
}

