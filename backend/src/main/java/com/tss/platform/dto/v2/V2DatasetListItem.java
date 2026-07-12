package com.tss.platform.dto.v2;

import lombok.Data;

import java.util.List;

@Data
public class V2DatasetListItem {
    private String datasetId;
    private String name;
    private String type;
    private V2DatasetVersionSummary currentVersion;
    // Current READY version file count. Null means the backend could not compute it.
    private Long currentVersionFileCount;
    // Compatibility alias for currentVersionFileCount; retained for existing V2 clients.
    private Long fileCount;
    private String displayStatus;
    private Boolean hasDraft;
    private String editSessionId;
    private Integer importProgress;
    private Boolean canPublish;
    private List<String> availableActions;
    private V2UserError userError;
}
