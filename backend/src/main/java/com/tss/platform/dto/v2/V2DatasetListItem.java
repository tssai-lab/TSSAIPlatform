package com.tss.platform.dto.v2;

import lombok.Data;

import java.util.List;

@Data
public class V2DatasetListItem {
    private String datasetId;
    private String name;
    private String type;
    private V2DatasetVersionSummary currentVersion;
    private Long currentVersionFileCount;
    private String displayStatus;
    private Boolean hasDraft;
    private String editSessionId;
    private Integer importProgress;
    private Boolean canPublish;
    private List<String> availableActions;
    private V2UserError userError;
}
