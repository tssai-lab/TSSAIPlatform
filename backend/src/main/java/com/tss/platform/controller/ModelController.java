package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.ModelCodeFileDto;
import com.tss.platform.dto.ModelCodePreviewDto;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.service.ModelCodePreviewService;
import com.tss.platform.service.MinioDeleteTaskService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/model")
public class ModelController {

    private static final Logger log = LoggerFactory.getLogger(ModelController.class);

    private final ModelAssetRepository modelAssetRepo;
    private final ModelVersionRepository modelVersionRepo;
    private final TrainingExperimentVersionRepository trainingRepo;
    private final MinioDeleteTaskService minioDeleteTaskService;
    private final ModelCodePreviewService codePreviewService;
    private final AuthContext authContext;

    public ModelController(ModelAssetRepository modelAssetRepo,
                           ModelVersionRepository modelVersionRepo,
                           TrainingExperimentVersionRepository trainingRepo,
                           MinioDeleteTaskService minioDeleteTaskService,
                           ModelCodePreviewService codePreviewService,
                           AuthContext authContext) {
        this.modelAssetRepo = modelAssetRepo;
        this.modelVersionRepo = modelVersionRepo;
        this.trainingRepo = trainingRepo;
        this.minioDeleteTaskService = minioDeleteTaskService;
        this.codePreviewService = codePreviewService;
        this.authContext = authContext;
    }

    @GetMapping("/list")
    public ApiResponse<Map<String, Object>> list(
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "current", required = false) Integer current,
            @RequestParam(value = "pageSize", required = false) Integer pageSize
    ) {
        String normalizedType = null;
        if (type != null && !type.isBlank()) {
            try {
                normalizedType = com.tss.platform.model.TaskType.normalize(type);
            } catch (IllegalArgumentException e) {
                return ApiResponse.fail(e.getMessage());
            }
        }

        List<ModelAsset> visibleAssets = authContext.isAdmin()
                ? modelAssetRepo.findByDeletedFalse()
                : modelAssetRepo.findByOwnerUserIdAndDeletedFalse(authContext.currentUserId());
        Set<String> visibleAssetIds = visibleAssets.stream()
                .map(ModelAsset::getId)
                .filter(id -> id != null && !id.isBlank())
                .collect(Collectors.toSet());
        List<ModelVersion> versions = authContext.isAdmin()
                ? modelVersionRepo.findByDeletedFalse()
                : (visibleAssetIds.isEmpty() ? List.of() : modelVersionRepo.findByAssetIdInAndDeletedFalse(visibleAssetIds));
        Map<String, ModelAsset> assetsById = visibleAssets.stream()
                .collect(Collectors.toMap(ModelAsset::getId, asset -> asset));

        final String filterType = normalizedType;
        final String normalizedKeyword = normalizeKeyword(keyword);
        List<Map<String, Object>> allData = versions.stream()
                .map(v -> toListItem(v, assetsById.get(v.getAssetId())))
                .filter(item -> filterType == null || filterType.equals(item.get("type")))
                .filter(item -> matchesKeyword(item, normalizedKeyword))
                .sorted(Comparator.comparing(
                        item -> String.valueOf(item.getOrDefault("createdAt", "")),
                        Comparator.reverseOrder()
                ))
                .collect(Collectors.toList());

        List<Map<String, Object>> data = paginate(allData, page, current, pageSize);

        Map<String, Object> result = new HashMap<>();
        result.put("data", data);
        result.put("total", allData.size());
        result.put("page", resolvePage(page, current));
        result.put("pageSize", resolvePageSize(pageSize, allData.size()));
        return ApiResponse.ok(result);
    }

    private Map<String, Object> toListItem(ModelVersion version, ModelAsset asset) {
        Map<String, Object> item = new HashMap<>();
        item.put("id", version.getId());
        item.put("assetId", version.getAssetId());
        item.put("name", asset != null ? asset.getName() : null);
        item.put("version", version.getVersion());
        item.put("type", asset != null ? asset.getType() : null);
        item.put("remark", asset != null ? asset.getRemark() : null);
        item.put("ownerUserId", version.getOwnerUserId());
        item.put("storagePath", version.getStoragePath());
        item.put("fileName", version.getFileName());
        item.put("sizeBytes", version.getSizeBytes());
        item.put("createdAt", version.getCreatedAt());
        return item;
    }

    @GetMapping("/detail")
    public ApiResponse<Map<String, Object>> detail(@RequestParam String id) {
        Optional<ModelVersion> v = modelVersionRepo.findByIdAndDeletedFalse(id);
        if (v.isEmpty()) {
            return ApiResponse.fail("model not found");
        }
        ModelVersion ver = v.get();
        if (!authContext.canAccessOwner(effectiveOwner(ver))) {
            return ApiResponse.fail("model not found or no permission");
        }
        Optional<ModelAsset> a = modelAssetRepo.findByIdAndDeletedFalse(ver.getAssetId());
        Map<String, Object> item = new HashMap<>();
        item.put("id", ver.getId());
        item.put("assetId", ver.getAssetId());
        item.put("name", a.map(ModelAsset::getName).orElse(null));
        item.put("version", ver.getVersion());
        item.put("type", a.map(ModelAsset::getType).orElse(null));
        item.put("remark", a.map(ModelAsset::getRemark).orElse(null));
        item.put("ownerUserId", ver.getOwnerUserId());
        item.put("storagePath", ver.getStoragePath());
        item.put("sizeBytes", ver.getSizeBytes());
        item.put("createdAt", ver.getCreatedAt());
        return ApiResponse.ok(item);
    }

    @GetMapping("/code-files")
    public ApiResponse<List<ModelCodeFileDto>> codeFiles(@RequestParam String id) {
        try {
            return ApiResponse.ok(codePreviewService.listCodeFiles(id));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @GetMapping("/previewCode")
    public ApiResponse<ModelCodePreviewDto> previewCode(
            @RequestParam String id,
            @RequestParam String path
    ) {
        try {
            return ApiResponse.ok(codePreviewService.previewCode(id, path));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @DeleteMapping("/delete")
    @Transactional
    public ApiResponse<Map<String, Object>> delete(@RequestParam String id) {
        Optional<ModelVersion> v = modelVersionRepo.findByIdAndDeletedFalse(id);
        if (v.isEmpty()) {
            return ApiResponse.fail("model not found");
        }
        ModelVersion ver = v.get();
        if (!authContext.canAccessOwner(effectiveOwner(ver))) {
            return ApiResponse.fail("model not found or no permission");
        }
        ModelAsset asset = modelAssetRepo.findByIdAndDeletedFalse(ver.getAssetId()).orElse(null);
        if (asset == null) {
            log.warn("Reject model delete because parent asset is missing or deleted: id={}, assetId={}", id, ver.getAssetId());
            return ApiResponse.fail("model version parent asset not found or deleted: " + ver.getAssetId());
        }
        Integer ownerUserId = ver.getOwnerUserId() != null ? ver.getOwnerUserId() : asset.getOwnerUserId();
        if (trainingRepo.countByModelVersionId(id) > 0) {
            log.warn("Reject model delete because version is referenced by training experiments: id={}", id);
            return ApiResponse.fail("model version is referenced by training experiments");
        }
        boolean minioDeleteQueued = false;
        if (ver.getStoragePath() != null && !ver.getStoragePath().isBlank()) {
            try {
                authContext.requireObjectAccess(ver.getStoragePath(), ownerUserId, "object not found or no permission");
                minioDeleteTaskService.enqueueDefaultBucketDelete(
                        ver.getStoragePath(),
                        MinioDeleteTaskService.SOURCE_MODEL_VERSION,
                        id,
                        ownerUserId
                );
                minioDeleteQueued = true;
            } catch (IllegalArgumentException e) {
                return ApiResponse.fail(e.getMessage());
            } catch (Exception e) {
                log.warn("Reject model delete because MinIO delete task cannot be queued: id={}, error={}", id, e.getMessage());
                return ApiResponse.fail("创建模型文件删除任务失败: " + e.getMessage());
            }
        }
        Instant now = Instant.now();
        ver.setDeleted(true);
        ver.setDeletedAt(now);
        modelVersionRepo.save(ver);
        log.info(
                "Model version soft deleted through /api/model/delete: id={}, assetId={}, minioDeleteQueued={}, ownerUserId={}",
                id,
                ver.getAssetId(),
                minioDeleteQueued,
                ownerUserId
        );

        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("assetId", ver.getAssetId());
        result.put("deleted", true);
        result.put("minioDeleteQueued", minioDeleteQueued);
        return ApiResponse.ok(result);
    }

    private Integer effectiveOwner(ModelVersion version) {
        if (version.getOwnerUserId() != null) {
            return version.getOwnerUserId();
        }
        return modelAssetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .map(ModelAsset::getOwnerUserId)
                .orElse(null);
    }

    private String normalizeKeyword(String keyword) {
        return keyword == null || keyword.isBlank() ? null : keyword.trim().toLowerCase();
    }

    private boolean matchesKeyword(Map<String, Object> item, String keyword) {
        if (keyword == null) {
            return true;
        }
        return containsIgnoreCase(item.get("name"), keyword)
                || containsIgnoreCase(item.get("version"), keyword)
                || containsIgnoreCase(item.get("remark"), keyword)
                || containsIgnoreCase(item.get("fileName"), keyword);
    }

    private boolean containsIgnoreCase(Object value, String keyword) {
        return value != null && value.toString().toLowerCase().contains(keyword);
    }

    private List<Map<String, Object>> paginate(
            List<Map<String, Object>> source,
            Integer page,
            Integer current,
            Integer pageSize
    ) {
        int size = resolvePageSize(pageSize, source.size());
        if (size <= 0 || size >= source.size()) {
            return source;
        }
        int pageNo = resolvePage(page, current);
        int from = Math.min((pageNo - 1) * size, source.size());
        int to = Math.min(from + size, source.size());
        return source.subList(from, to);
    }

    private int resolvePage(Integer page, Integer current) {
        if (current != null && current > 0) {
            return current;
        }
        return page != null && page > 0 ? page : 1;
    }

    private int resolvePageSize(Integer pageSize, int total) {
        return pageSize != null && pageSize > 0 ? pageSize : total;
    }
}
