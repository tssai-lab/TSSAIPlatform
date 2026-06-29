package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.model.DatasetTaskType;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.service.DatasetVersionFileCountService;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/dataset")
public class DatasetController {

    private final DatasetAssetRepository assetRepo;
    private final DatasetVersionRepository versionRepo;
    private final ImportJobRepository importJobRepo;
    private final AuthContext authContext;
    private final DatasetVersionFileCountService fileCountService;

    public DatasetController(
            DatasetAssetRepository assetRepo,
            DatasetVersionRepository versionRepo,
            ImportJobRepository importJobRepo,
            AuthContext authContext,
            DatasetVersionFileCountService fileCountService
    ) {
        this.assetRepo = assetRepo;
        this.versionRepo = versionRepo;
        this.importJobRepo = importJobRepo;
        this.authContext = authContext;
        this.fileCountService = fileCountService;
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
                normalizedType = DatasetTaskType.normalize(type);
            } catch (IllegalArgumentException e) {
                return ApiResponse.fail(e.getMessage());
            }
        }

        final String filterType = normalizedType;
        final String normalizedKeyword = normalizeKeyword(keyword);
        List<DatasetAsset> assets = authContext.isAdmin()
                ? assetRepo.findByDeletedFalse()
                : assetRepo.findByOwnerUserIdAndDeletedFalse(authContext.currentUserId());
        List<DatasetAsset> filteredAssets = assets.stream()
                .filter(asset -> filterType == null || filterType.equals(asset.getType()))
                .collect(Collectors.toList());

        Set<String> assetIds = filteredAssets.stream()
                .map(DatasetAsset::getId)
                .filter(id -> id != null && !id.isBlank())
                .collect(Collectors.toSet());
        List<DatasetVersion> versions = assetIds.isEmpty()
                ? List.of()
                : versionRepo.findByAssetIdInAndDeletedFalse(assetIds);
        Map<String, DatasetAsset> assetById = filteredAssets.stream()
                .collect(Collectors.toMap(DatasetAsset::getId, asset -> asset));
        Map<String, DatasetVersion> versionById = versions.stream()
                .collect(Collectors.toMap(DatasetVersion::getId, version -> version));
        Map<String, List<DatasetVersion>> versionsByAssetId = versions.stream()
                .collect(Collectors.groupingBy(DatasetVersion::getAssetId));
        Map<String, DatasetVersion> latestDraftByAssetId = versions.stream()
                .filter(version -> "DRAFT".equals(version.getStatus()))
                .collect(Collectors.toMap(
                        DatasetVersion::getAssetId,
                        version -> version,
                        this::newerVersion
                ));
        Set<String> latestDraftIds = latestDraftByAssetId.values().stream()
                .map(DatasetVersion::getId)
                .collect(Collectors.toSet());
        Map<String, ImportJob> jobsByVersionId = latestDraftIds.isEmpty()
                ? Map.of()
                : importJobRepo.findByDatasetVersionIdIn(latestDraftIds).stream()
                .collect(Collectors.toMap(
                        ImportJob::getDatasetVersionId,
                        job -> job,
                        this::newerImportJob
                ));

        List<Map<String, Object>> allData = filteredAssets.stream()
                .map(asset -> toListItem(
                        asset,
                        versionsByAssetId.getOrDefault(asset.getId(), List.of()),
                        latestDraftByAssetId.get(asset.getId()),
                        jobsByVersionId
                ))
                .filter(item -> matchesKeyword(item, normalizedKeyword))
                .sorted(Comparator.comparing(
                        item -> String.valueOf(item.getOrDefault("uploadTime", "")),
                        Comparator.reverseOrder()
                ))
                .collect(Collectors.toList());
        List<Map<String, Object>> data = paginate(allData, page, current, pageSize);
        enrichCurrentVersionFileCounts(data, assetById, versionById);

        Map<String, Object> result = new HashMap<>();
        result.put("data", data);
        result.put("total", allData.size());
        result.put("page", resolvePage(page, current));
        result.put("pageSize", resolvePageSize(pageSize, allData.size()));
        return ApiResponse.ok(result);
    }

    private Map<String, Object> toListItem(
            DatasetAsset asset,
            List<DatasetVersion> versions,
            DatasetVersion latestDraft,
            Map<String, ImportJob> jobsByVersionId
    ) {
        DatasetVersion version = currentVersion(asset, versions);
        ImportJob importJob = latestDraft == null ? null : jobsByVersionId.get(latestDraft.getId());

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
        item.put("version", version != null ? displayVersionLabel(version) : null);
        item.put("currentVersionId", version != null ? version.getId() : null);
        item.put("currentVersionNo", version != null ? version.getVersionNo() : null);
        item.put("currentVersionLabel", version != null ? displayVersionLabel(version) : null);
        item.put("versionStatus", version != null ? version.getStatus() : null);
        item.put("versionDescription", version != null ? version.getDescription() : null);
        item.put("fileName", version != null ? version.getFileName() : null);
        item.put("storagePath", version != null ? version.getStoragePath() : null);
        item.put("sizeBytes", version != null ? version.getSizeBytes() : null);
        item.put("size", formatBytes(version != null ? version.getSizeBytes() : null));
        item.put("versionRemark", version != null ? version.getRemark() : null);
        item.put("versionCount", versions.size());
        item.put("currentVersionFileCount", null);
        item.put("fileCount", null);
        item.put("uploadTime", version != null && version.getCreatedAt() != null
                ? version.getCreatedAt()
                : asset.getCreatedAt());
        item.put("createdAt", asset.getCreatedAt());
        item.put("updatedAt", asset.getUpdatedAt());
        item.put("latestDraftVersionId", latestDraft != null ? latestDraft.getId() : null);
        item.put("importJobId", importJob != null ? importJob.getId() : null);
        item.put("importStatus", importJob != null ? importJob.getStatus() : null);
        item.put("importProgress", importJob != null ? importJob.getProgress() : null);
        item.put("importErrorMessage", importJob != null ? importJob.getErrorMessage() : null);
        return item;
    }

    private void enrichCurrentVersionFileCounts(
            List<Map<String, Object>> items,
            Map<String, DatasetAsset> assetById,
            Map<String, DatasetVersion> versionById
    ) {
        for (Map<String, Object> item : items) {
            DatasetAsset asset = assetById.get((String) item.get("assetId"));
            DatasetVersion version = versionById.get((String) item.get("currentVersionId"));
            Long currentVersionFileCount =
                    fileCountService.countCurrentVersionFiles(asset, version);
            item.put("currentVersionFileCount", currentVersionFileCount);
            item.put("fileCount", currentVersionFileCount);
        }
    }

    private DatasetVersion newerVersion(DatasetVersion left, DatasetVersion right) {
        Comparator<DatasetVersion> comparator = Comparator
                .comparing(DatasetVersion::getVersionNo, Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(DatasetVersion::getCreatedAt, Comparator.nullsFirst(Comparator.naturalOrder()));
        return comparator.compare(left, right) >= 0 ? left : right;
    }

    private ImportJob newerImportJob(ImportJob left, ImportJob right) {
        Comparator<ImportJob> comparator = Comparator
                .comparing(ImportJob::getCreatedAt, Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(ImportJob::getId, Comparator.nullsFirst(Comparator.naturalOrder()));
        return comparator.compare(left, right) >= 0 ? left : right;
    }

    private String normalizeKeyword(String keyword) {
        return keyword == null || keyword.isBlank() ? null : keyword.trim().toLowerCase();
    }

    private DatasetVersion currentVersion(DatasetAsset asset, List<DatasetVersion> versions) {
        String currentVersionId = asset.getCurrentVersionId();
        if (currentVersionId != null && !currentVersionId.isBlank()) {
            Optional<DatasetVersion> current = versions.stream()
                    .filter(version -> currentVersionId.equals(version.getId()))
                    .filter(version -> "READY".equals(version.getStatus()))
                    .findFirst();
            if (current.isPresent()) {
                return current.get();
            }
        }
        return versions.stream()
                .filter(version -> "READY".equals(version.getStatus()))
                .max(Comparator
                        .comparing(DatasetVersion::getVersionNo, Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(DatasetVersion::getCreatedAt, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);
    }

    private String displayVersionLabel(DatasetVersion version) {
        if (version.getVersionLabel() != null && !version.getVersionLabel().isBlank()) {
            return version.getVersionLabel();
        }
        return version.getVersion();
    }

    private boolean matchesKeyword(Map<String, Object> item, String keyword) {
        if (keyword == null) {
            return true;
        }
        return containsIgnoreCase(item.get("name"), keyword)
                || containsIgnoreCase(item.get("version"), keyword)
                || containsIgnoreCase(item.get("remark"), keyword)
                || containsIgnoreCase(item.get("versionRemark"), keyword)
                || containsIgnoreCase(item.get("versionDescription"), keyword)
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
