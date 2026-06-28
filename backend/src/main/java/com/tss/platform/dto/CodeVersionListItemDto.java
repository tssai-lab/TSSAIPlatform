package com.tss.platform.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class CodeVersionListItemDto {
    private String codeVersionId;
    private String codeAssetId;
    private String codeAssetName;
    private String version;
    private String fileName;
    private String trainingProfile;
    private String approvalStatus;
    private String status;
}
