package com.tss.platform.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.dto.PageResponse;
import com.tss.platform.dto.v2.V2DatasetListItem;
import com.tss.platform.dto.v2.V2DatasetVersionSummary;
import com.tss.platform.dto.v2.V2UserError;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.model.DatasetTaskType;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class V2DatasetCatalogService {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 200;
    private static final Set<String> IMPORTING_STATUSES = Set.of("PENDING", "RUNNING");

    private final DatasetAssetRepository assetRepo;
    private final DatasetVersionRepository versionRepo;
    private final ImportJobRepository importJobRepo;
    private final DatasetSampleRepository sampleRepo;
    private final DatasetVersionFileCountService fileCountService;
    private final AuthContext authContext;
    private final ObjectMapper objectMapper;

    public V2DatasetCatalogService(
            DatasetAssetRepository assetRepo,
            DatasetVersionRepository versionRepo,
            ImportJobRepository importJobRepo,
            DatasetSampleRepository sampleRepo,
            DatasetVersionFileCountService fileCountService,
            AuthContext authContext,
            ObjectMapper objectMapper
    ) {
        this.assetRepo = assetRepo;
        this.versionRepo = versionRepo;
        this.importJobRepo = importJobRepo;
        this.sampleRepo = sampleRepo;
        this.fileCountService = fileCountService;
        this.authContext = authContext;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public PageResponse<V2DatasetListItem> list(
            String type,
            String keyword,
            Integer page,
            Integer current,
            Integer pageSize
    ) {
        String normalizedType = type == null || type.isBlank()
                ? null
                : DatasetTaskType.normalize(type);
        String normalizedKeyword = keyword == null || keyword.isBlank()
                ? null
                : keyword.trim().toLowerCase(Locale.ROOT);

        List<DatasetAsset> assets = authContext.isAdmin()
                ? assetRepo.findByDeletedFalse()
                : assetRepo.findByOwnerUserIdAndDeletedFalse(authContext.currentUserId());
        List<DatasetAsset> filteredAssets = assets.stream()
                .filter(asset -> normalizedType == null || normalizedType.equals(asset.getType()))
                .filter(asset -> matchesKeyword(asset, normalizedKeyword))
                .sorted(Comparator.comparing(
                        this::assetSortTime,
                        Comparator.nullsLast(Comparator.reverseOrder())
                ))
                .toList();

        Set<String> assetIds = filteredAssets.stream()
                .map(DatasetAsset::getId)
                .filter(id -> id != null && !id.isBlank())
                .collect(Collectors.toSet());
        List<DatasetVersion> versions = assetIds.isEmpty()
                ? List.of()
                : versionRepo.findByAssetIdInAndDeletedFalse(assetIds);
        Map<String, List<DatasetVersion>> versionsByAsset = versions.stream()
                .collect(Collectors.groupingBy(DatasetVersion::getAssetId));
        Map<String, DatasetVersion> draftsByAsset = versions.stream()
                .filter(version -> "DRAFT".equals(version.getStatus()))
                .collect(Collectors.toMap(
                        DatasetVersion::getAssetId,
                        Function.identity(),
                        this::newerVersion
                ));
        Set<String> draftIds = draftsByAsset.values().stream()
                .map(DatasetVersion::getId)
                .collect(Collectors.toSet());
        Map<String, List<ImportJob>> jobsByVersion = importJobsByVersion(draftIds);

        List<V2DatasetListItem> items = filteredAssets.stream()
                .map(asset -> toItem(
                        asset,
                        versionsByAsset.getOrDefault(asset.getId(), List.of()),
                        draftsByAsset.get(asset.getId()),
                        jobsByVersion
                ))
                .toList();

        int pageNo = resolvePage(page, current);
        int size = resolvePageSize(pageSize);
        int from = Math.min((pageNo - 1) * size, items.size());
        int to = Math.min(from + size, items.size());

        PageResponse<V2DatasetListItem> response = new PageResponse<>();
        response.setData(items.subList(from, to));
        response.setTotal(items.size());
        response.setPage(pageNo);
        response.setPageSize(size);
        response.setTotalPages(items.isEmpty() ? 0 : (items.size() + size - 1) / size);
        return response;
    }

    private V2DatasetListItem toItem(
            DatasetAsset asset,
            List<DatasetVersion> versions,
            DatasetVersion draft,
            Map<String, List<ImportJob>> jobsByVersion
    ) {
        DatasetVersion ready = currentReadyVersion(asset, versions);
        List<ImportJob> importJobs = draft == null
                ? List.of()
                : jobsByVersion.getOrDefault(draft.getId(), List.of());
        ImportJob importJob = latestImportJob(importJobs);
        String displayStatus = displayStatus(ready, draft, importJob);
        boolean canPublish = draft != null
                && sampleRepo.countByDatasetVersionIdAndDeletedFalse(draft.getId()) > 0
                && importJobs.stream()
                        .allMatch(job -> "SUCCESS".equals(job.getStatus()));

        List<String> actions = new ArrayList<>();
        actions.add("VIEW");
        if (ready != null) {
            actions.add("PREVIEW");
        }
        if (ready != null || draft != null) {
            actions.add("EDIT");
        }
        if (draft != null && "MULTIMODAL".equals(asset.getType())) {
            actions.add("ADD_DATA");
        }
        if (canPublish) {
            actions.add("PUBLISH");
        }

        V2DatasetListItem item = new V2DatasetListItem();
        item.setDatasetId(asset.getId());
        item.setName(asset.getName());
        item.setType(asset.getType());
        item.setCurrentVersion(ready == null ? null : new V2DatasetVersionSummary(
                ready.getId(),
                displayVersion(ready),
                ready.getVersionNo(),
                ready.getStatus()
        ));
        Long currentVersionFileCount = fileCountService.countCurrentVersionFiles(asset, ready);
        item.setCurrentVersionFileCount(currentVersionFileCount);
        item.setFileCount(currentVersionFileCount);
        item.setDisplayStatus(displayStatus);
        item.setHasDraft(draft != null);
        item.setEditSessionId(draft == null ? null : draft.getId());
        item.setImportProgress(importJob == null ? null : importJob.getProgress());
        item.setCanPublish(canPublish);
        item.setAvailableActions(List.copyOf(actions));
        item.setUserError(userError(importJob));
        return item;
    }

    private Map<String, List<ImportJob>> importJobsByVersion(
            Collection<String> draftIds
    ) {
        if (draftIds.isEmpty()) {
            return Map.of();
        }
        return importJobRepo.findByDatasetVersionIdIn(draftIds).stream()
                .collect(Collectors.groupingBy(ImportJob::getDatasetVersionId));
    }

    private ImportJob latestImportJob(List<ImportJob> jobs) {
        return jobs.stream()
                .reduce(this::newerImportJob)
                .orElse(null);
    }

    private DatasetVersion currentReadyVersion(
            DatasetAsset asset,
            List<DatasetVersion> versions
    ) {
        if (asset.getCurrentVersionId() != null) {
            DatasetVersion selected = versions.stream()
                    .filter(version -> asset.getCurrentVersionId().equals(version.getId()))
                    .filter(version -> "READY".equals(version.getStatus()))
                    .findFirst()
                    .orElse(null);
            if (selected != null) {
                return selected;
            }
        }
        return versions.stream()
                .filter(version -> "READY".equals(version.getStatus()))
                .max(this::compareVersions)
                .orElse(null);
    }

    private String displayStatus(
            DatasetVersion ready,
            DatasetVersion draft,
            ImportJob importJob
    ) {
        if (importJob != null && "FAILED".equals(importJob.getStatus())) {
            return "IMPORT_FAILED";
        }
        if (importJob != null && IMPORTING_STATUSES.contains(importJob.getStatus())) {
            return "IMPORTING";
        }
        if (draft != null) {
            return "EDITING";
        }
        return ready != null ? "READY" : "EMPTY";
    }

    private V2UserError userError(ImportJob job) {
        if (job == null || !"FAILED".equals(job.getStatus())) {
            return null;
        }
        String code = job.getErrorCode() == null ? "IMPORT_FAILED" : job.getErrorCode();
        String message = job.getErrorMessage() == null
                ? "数据导入失败，请检查上传内容后重试"
                : job.getErrorMessage();
        return new V2UserError(code, message, parseDetails(job.getErrorDetailsJson()));
    }

    private Map<String, Object> parseDetails(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, Object> parsed = objectMapper.readValue(
                    json,
                    new TypeReference<LinkedHashMap<String, Object>>() {
                    }
            );
            return Map.copyOf(parsed);
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private DatasetVersion newerVersion(DatasetVersion left, DatasetVersion right) {
        return compareVersions(left, right) >= 0 ? left : right;
    }

    private int compareVersions(DatasetVersion left, DatasetVersion right) {
        return Comparator
                .comparing(
                        DatasetVersion::getVersionNo,
                        Comparator.nullsFirst(Comparator.naturalOrder())
                )
                .thenComparing(
                        DatasetVersion::getCreatedAt,
                        Comparator.nullsFirst(Comparator.naturalOrder())
                )
                .compare(left, right);
    }

    private ImportJob newerImportJob(ImportJob left, ImportJob right) {
        Comparator<ImportJob> comparator = Comparator
                .comparing(
                        ImportJob::getCreatedAt,
                        Comparator.nullsFirst(Comparator.naturalOrder())
                )
                .thenComparing(
                        ImportJob::getId,
                        Comparator.nullsFirst(Comparator.naturalOrder())
                );
        return comparator.compare(left, right) >= 0 ? left : right;
    }

    private boolean matchesKeyword(DatasetAsset asset, String keyword) {
        return keyword == null
                || contains(asset.getName(), keyword)
                || contains(asset.getRemark(), keyword);
    }

    private boolean contains(String value, String keyword) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(keyword);
    }

    private Instant assetSortTime(DatasetAsset asset) {
        return asset.getUpdatedAt() != null ? asset.getUpdatedAt() : asset.getCreatedAt();
    }

    private String displayVersion(DatasetVersion version) {
        return version.getVersionLabel() != null && !version.getVersionLabel().isBlank()
                ? version.getVersionLabel()
                : version.getVersion();
    }

    private int resolvePage(Integer page, Integer current) {
        if (current != null && current > 0) {
            return current;
        }
        return page != null && page > 0 ? page : 1;
    }

    private int resolvePageSize(Integer pageSize) {
        if (pageSize == null || pageSize <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(pageSize, MAX_PAGE_SIZE);
    }
}
