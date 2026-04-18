package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.service.MinioService;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/model")
public class ModelController {

    private final ModelAssetRepository modelAssetRepo;
    private final ModelVersionRepository modelVersionRepo;
    private final MinioService minioService;

    public ModelController(ModelAssetRepository modelAssetRepo,
                           ModelVersionRepository modelVersionRepo,
                           MinioService minioService) {
        this.modelAssetRepo = modelAssetRepo;
        this.modelVersionRepo = modelVersionRepo;
        this.minioService = minioService;
    }

    @GetMapping("/list")
    public ApiResponse<Map<String, Object>> list() {
        List<ModelVersion> versions = modelVersionRepo.findAll();
        // 高并发列表：只读数据库元数据，不在列表接口里打 MinIO
        List<Map<String, Object>> data = versions.stream().map(v -> {
            Optional<ModelAsset> assetOpt = modelAssetRepo.findById(v.getAssetId());
            ModelAsset asset = assetOpt.orElse(null);
            Map<String, Object> item = new HashMap<>();
            item.put("id", v.getId());
            item.put("name", asset != null ? asset.getName() : null);
            item.put("version", v.getVersion());
            item.put("type", asset != null ? asset.getType() : null);
            item.put("remark", asset != null ? asset.getRemark() : null);
            item.put("storagePath", v.getStoragePath());
            item.put("sizeBytes", v.getSizeBytes());
            item.put("createdAt", v.getCreatedAt());
            return item;
        }).collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("data", data);
        result.put("total", data.size());
        return ApiResponse.ok(result);
    }

    @GetMapping("/detail")
    public ApiResponse<Map<String, Object>> detail(@RequestParam String id) {
        Optional<ModelVersion> v = modelVersionRepo.findById(id);
        if (v.isEmpty()) {
            return ApiResponse.fail("模型不存在");
        }
        ModelVersion ver = v.get();
        Optional<ModelAsset> a = modelAssetRepo.findById(ver.getAssetId());
        Map<String, Object> item = new HashMap<>();
        item.put("id", ver.getId());
        item.put("assetId", ver.getAssetId());
        item.put("name", a.map(ModelAsset::getName).orElse(null));
        item.put("version", ver.getVersion());
        item.put("type", a.map(ModelAsset::getType).orElse(null));
        item.put("remark", a.map(ModelAsset::getRemark).orElse(null));
        item.put("storagePath", ver.getStoragePath());
        item.put("sizeBytes", ver.getSizeBytes());
        item.put("createdAt", ver.getCreatedAt());
        return ApiResponse.ok(item);
    }

    @DeleteMapping("/delete")
    public ApiResponse<Void> delete(@RequestParam String id) {
        Optional<ModelVersion> v = modelVersionRepo.findById(id);
        if (v.isEmpty()) {
            return ApiResponse.fail("模型不存在");
        }
        ModelVersion ver = v.get();
        try {
            if (ver.getStoragePath() != null && !ver.getStoragePath().isBlank()) {
                minioService.deleteObject(ver.getStoragePath());
            }
        } catch (Exception ignored) {
            // 删除 MinIO 失败不阻断数据库删除（避免脏状态卡死）
        }
        modelVersionRepo.deleteById(id);
        return ApiResponse.ok(null);
    }
}
