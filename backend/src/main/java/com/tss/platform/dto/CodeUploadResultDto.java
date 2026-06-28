package com.tss.platform.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class CodeUploadResultDto {
    private String codeAssetId;
    private String codeVersionId;
    private String version;
    private String fileName;
    private String storagePath;
    private Long sizeBytes;
    private String trainingProfile;
    private String status;
    private String approvalStatus;
}
