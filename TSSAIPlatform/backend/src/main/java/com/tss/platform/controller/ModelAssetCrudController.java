package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.repository.ModelAssetRepository;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/model-assets")
public class ModelAssetCrudController {

    private final ModelAssetRepository repo;

    public ModelAssetCrudController(ModelAssetRepository repo) {
        this.repo = repo;
    }

    @PostMapping
    public ApiResponse<ModelAsset> create(@RequestBody ModelAsset body) {
        if (body.getId() == null || body.getId().isBlank()) {
            body.setId("model-asset-" + UUID.randomUUID().toString().replace("-", ""));
        }
        if (body.getCreatedAt() == null) {
            body.setCreatedAt(Instant.now());
        }
        body.setUpdatedAt(Instant.now());
        return ApiResponse.ok(repo.save(body));
    }

    @GetMapping("/{id}")
    public ApiResponse<ModelAsset> get(@PathVariable String id) {
        Optional<ModelAsset> v = repo.findById(id);
        return v.map(ApiResponse::ok).orElseGet(() -> ApiResponse.fail("未找到: " + id));
    }

    @GetMapping
    public ApiResponse<List<ModelAsset>> list() {
        return ApiResponse.ok(repo.findAll());
    }

    @PutMapping("/{id}")
    public ApiResponse<ModelAsset> update(@PathVariable String id, @RequestBody ModelAsset body) {
        Optional<ModelAsset> existing = repo.findById(id);
        if (existing.isEmpty()) {
            return ApiResponse.fail("未找到: " + id);
        }
        ModelAsset e = existing.get();
        e.setName(body.getName());
        e.setType(body.getType());
        e.setRemark(body.getRemark());
        e.setUpdatedAt(Instant.now());
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

