package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.repository.DatasetAssetRepository;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/dataset-assets")
public class DatasetAssetCrudController {

    private final DatasetAssetRepository repo;

    public DatasetAssetCrudController(DatasetAssetRepository repo) {
        this.repo = repo;
    }

    @PostMapping
    public ApiResponse<DatasetAsset> create(@RequestBody DatasetAsset body) {
        if (body.getId() == null || body.getId().isBlank()) {
            body.setId("dataset-asset-" + UUID.randomUUID().toString().replace("-", ""));
        }
        if (body.getCreatedAt() == null) {
            body.setCreatedAt(Instant.now());
        }
        body.setUpdatedAt(Instant.now());
        return ApiResponse.ok(repo.save(body));
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

