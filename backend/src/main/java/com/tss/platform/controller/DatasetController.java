package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.model.TaskType;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/dataset")
public class DatasetController {

    private final DatasetAssetRepository assetRepo;
    private final DatasetVersionRepository versionRepo;
    private final AuthContext authContext;

    public DatasetController(
            DatasetAssetRepository assetRepo,
            DatasetVersionRepository versionRepo,
            AuthContext authContext
    ) {
        this.assetRepo = assetRepo;
        this.versionRepo = versionRepo;
        this.authContext = authContext;
    }

    @GetMapping("/list")
    public ApiResponse<Map<String, Object>> list(
            @RequestParam(value = "type", required = false) String type
    ) {
        String normalizedType = null;
        if (type != null && !type.isBlank()) {
            try {
                normalizedType = TaskType.normalize(type);
            } catch (IllegalArgumentException e) {
                return ApiResponse.fail(e.getMessage());
            }
        }

        final String filterType = normalizedType;
        List<DatasetAsset> assets = authContext.isAdmin()
                ? assetRepo.findAll()
                : assetRepo.findByOwnerUserId(authContext.currentUserId());

        List<Map<String, Object>> data = assets
                .stream()
                .filter(asset -> filterType == null || filterType.equals(asset.getType()))
                .map(this::toListItem)
                .sorted(Comparator.comparing(
                        item -> String.valueOf(item.getOrDefault("uploadTime", "")),
                        Comparator.reverseOrder()
                ))
                .collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("data", data);
        result.put("total", data.size());
        return ApiResponse.ok(result);
    }

    private Map<String, Object> toListItem(DatasetAsset asset) {
        List<DatasetVersion> versions = versionRepo.findByAssetId(asset.getId());
        Optional<DatasetVersion> latest = versions.stream()
                .max(Comparator.comparing(
                        DatasetVersion::getCreatedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())
                ));
        DatasetVersion version = latest.orElse(null);

        Map<String, Object> item = new HashMap<>();
        item.put("id", asset.getId());
        item.put("assetId", asset.getId());
        item.put("name", asset.getName());
        item.put("type", asset.getType());
        item.put("cvTaskType", version != null && version.getCvTaskType() != null
                ? version.getCvTaskType()
                : asset.getCvTaskType());
        item.put("annotationFormat", version != null && version.getAnnotationFormat() != null
                ? version.getAnnotationFormat()
                : asset.getAnnotationFormat());
        item.put("remark", asset.getRemark());
        item.put("ownerUserId", asset.getOwnerUserId());
        item.put("versionId", version != null ? version.getId() : null);
        item.put("version", version != null ? version.getVersion() : null);
        item.put("fileName", version != null ? version.getFileName() : null);
        item.put("storagePath", version != null ? version.getStoragePath() : null);
        item.put("sizeBytes", version != null ? version.getSizeBytes() : null);
        item.put("size", formatBytes(version != null ? version.getSizeBytes() : null));
        item.put("versionRemark", version != null ? version.getRemark() : null);
        item.put("fileCount", versions.size());
        item.put("uploadTime", version != null && version.getCreatedAt() != null
                ? version.getCreatedAt()
                : asset.getCreatedAt());
        item.put("createdAt", asset.getCreatedAt());
        item.put("updatedAt", asset.getUpdatedAt());
        return item;
    }

    private String formatBytes(Long bytes) {
        if (bytes == null) {
            return "-";
        }
        if (bytes < 1024) {
            return bytes + " B";
        }
        String[] units = {"KB", "MB", "GB", "TB"};
        double value = bytes / 1024.0;
        int index = 0;
        while (value >= 1024 && index < units.length - 1) {
            value /= 1024.0;
            index += 1;
        }
        return String.format("%.2f %s", value, units[index]);
    }
}
