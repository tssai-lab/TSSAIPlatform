package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.repository.DatasetVersionRepository;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/dataset-versions")
public class DatasetVersionCrudController {

    private final DatasetVersionRepository repo;

    public DatasetVersionCrudController(DatasetVersionRepository repo) {
        this.repo = repo;
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

