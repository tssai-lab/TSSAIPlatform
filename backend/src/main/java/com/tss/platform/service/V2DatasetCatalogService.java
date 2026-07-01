package com.tss.platform.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.dto.PageResponse;
import com.tss.platform.dto.v2.V2DatasetListItem;
import com.tss.platform.dto.v2.V2DatasetVersionSummary;
import com.tss.platform.dto.v2.V2UserError;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class V2DatasetCatalogService {

    private static final Set<String> IMPORTING_STATUSES = Set.of("PENDING", "RUNNING");

    private final DatasetCatalogQueryService catalogQueryService;
    private final DatasetSampleRepository sampleRepo;
    private final ObjectMapper objectMapper;

    @Autowired
    public V2DatasetCatalogService(
            DatasetCatalogQueryService catalogQueryService,
            DatasetSampleRepository sampleRepo,
            ObjectMapper objectMapper
    ) {
        this.catalogQueryService = catalogQueryService;
        this.sampleRepo = sampleRepo;
        this.objectMapper = objectMapper;
    }

    V2DatasetCatalogService(
            DatasetAssetRepository assetRepo,
            DatasetVersionRepository versionRepo,
            ImportJobRepository importJobRepo,
            DatasetSampleRepository sampleRepo,
            DatasetVersionFileCountService fileCountService,
            AuthContext authContext,
            ObjectMapper objectMapper
    ) {
        this(
                new DatasetCatalogQueryService(
                        assetRepo,
                        versionRepo,
                        importJobRepo,
                        fileCountService,
                        authContext
                ),
                sampleRepo,
                objectMapper
        );
    }

    @Transactional(readOnly = true)
    public PageResponse<V2DatasetListItem> list(
            String type,
            String keyword,
            Integer page,
            Integer current,
            Integer pageSize
    ) {
        PageResponse<DatasetCatalogQueryService.CatalogItem> catalog =
                catalogQueryService.list(type, keyword, page, current, pageSize);
        PageResponse<V2DatasetListItem> response = new PageResponse<>();
        response.setData(catalog.getData().stream()
                .map(this::toItem)
                .toList());
        response.setTotal(catalog.getTotal());
        response.setPage(catalog.getPage());
        response.setPageSize(catalog.getPageSize());
        response.setTotalPages(catalog.getTotalPages());
        return response;
    }

    private V2DatasetListItem toItem(
            DatasetCatalogQueryService.CatalogItem catalogItem
    ) {
        DatasetVersion ready = catalogItem.currentVersion();
        DatasetVersion draft = catalogItem.latestDraft();
        ImportJob importJob = catalogItem.latestDraftImportJob();
        String displayStatus = displayStatus(ready, draft, importJob);
        boolean canPublish = draft != null
                && sampleRepo.countByDatasetVersionIdAndDeletedFalse(draft.getId()) > 0
                && catalogItem.latestDraftImportJobs().stream()
                        .allMatch(job -> "SUCCESS".equals(job.getStatus()));

        List<String> actions = new ArrayList<>();
        actions.add("VIEW");
        if (ready != null) {
            actions.add("PREVIEW");
        }
        if (ready != null || draft != null) {
            actions.add("EDIT");
        }
        if (draft != null) {
            actions.add("ADD_DATA");
        }
        if (canPublish) {
            actions.add("PUBLISH");
        }

        V2DatasetListItem item = new V2DatasetListItem();
        item.setDatasetId(catalogItem.asset().getId());
        item.setName(catalogItem.asset().getName());
        item.setType(catalogItem.asset().getType());
        item.setCurrentVersion(ready == null ? null : new V2DatasetVersionSummary(
                ready.getId(),
                displayVersion(ready),
                ready.getVersionNo(),
                ready.getStatus()
        ));
        item.setCurrentVersionFileCount(catalogItem.currentVersionFileCount());
        item.setFileCount(catalogItem.currentVersionFileCount());
        item.setDisplayStatus(displayStatus);
        item.setHasDraft(draft != null);
        item.setEditSessionId(draft == null ? null : draft.getId());
        item.setImportProgress(importJob == null ? null : importJob.getProgress());
        item.setCanPublish(canPublish);
        item.setAvailableActions(List.copyOf(actions));
        item.setUserError(userError(importJob));
        return item;
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

    private String displayVersion(DatasetVersion version) {
        return version.getVersionLabel() != null && !version.getVersionLabel().isBlank()
                ? version.getVersionLabel()
                : version.getVersion();
    }
}
