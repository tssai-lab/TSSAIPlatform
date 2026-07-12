package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.controller.v2.V2BusinessException;
import com.tss.platform.dto.PageResponse;
import com.tss.platform.dto.v2.V2DatasetListItem;
import com.tss.platform.dto.v2.V2DatasetVersionSummary;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
public class V2DatasetCatalogService {

    private final DatasetCatalogQueryService catalogQueryService;
    private final ObjectMapper objectMapper;

    @Autowired
    public V2DatasetCatalogService(
            DatasetCatalogQueryService catalogQueryService,
            DatasetSampleRepository sampleRepo,
            ObjectMapper objectMapper
    ) {
        this.catalogQueryService = catalogQueryService;
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
                        sampleRepo,
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

    @Transactional(readOnly = true)
    public V2DatasetListItem get(String datasetId) {
        try {
            return toItem(catalogQueryService.get(datasetId));
        } catch (DatasetCatalogQueryService.DatasetCatalogAccessException exception) {
            throw new V2BusinessException(
                    HttpStatus.NOT_FOUND,
                    "DATASET_NOT_FOUND",
                    "数据集不存在或无权访问"
            );
        }
    }

    private V2DatasetListItem toItem(
            DatasetCatalogQueryService.CatalogItem catalogItem
    ) {
        DatasetVersion ready = catalogItem.currentVersion();
        DatasetVersion draft = catalogItem.latestDraft();
        ImportJob statusJob =
                V2ImportJobStatusSelector.statusJobOf(catalogItem.latestDraftImportJobs());
        String displayStatus = V2ImportJobDisplayHelper.catalogDisplayStatus(
                ready,
                draft,
                statusJob
        );
        boolean canPublish = draft != null
                && catalogItem.latestDraftSampleCount() > 0
                && catalogItem.latestDraftImportJobs().stream()
                        .allMatch(job -> V2ImportJobDisplayHelper.isPublishTerminalJobStatus(job.getStatus()));

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
                V2ImportJobDisplayHelper.displayVersion(ready),
                ready.getVersionNo(),
                ready.getStatus()
        ));
        item.setCurrentVersionFileCount(catalogItem.currentVersionFileCount());
        // Compatibility alias for clients that still read fileCount on V2 list items.
        item.setFileCount(catalogItem.currentVersionFileCount());
        item.setDisplayStatus(displayStatus);
        item.setHasDraft(draft != null);
        item.setEditSessionId(draft == null ? null : draft.getId());
        item.setImportProgress(statusJob == null ? null : statusJob.getProgress());
        item.setCanPublish(canPublish);
        item.setAvailableActions(List.copyOf(actions));
        item.setUserError(V2ImportJobDisplayHelper.userError(statusJob, objectMapper));
        return item;
    }

}
