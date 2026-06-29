package com.tss.platform.dto.v2;

import lombok.Data;

import java.util.List;

@Data
public class V2DatasetEditSessionDto {
    private String editSessionId;
    private String datasetId;
    private String versionLabel;
    private String displayStatus;
    private V2DatasetUploadDto latestUpload;
    private Integer importProgress;
    private Long sampleCount;
    private Boolean canPublish;
    private List<String> availableActions;
    private V2UserError userError;
}
