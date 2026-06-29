package com.tss.platform.dto.v2;

import lombok.Data;

@Data
public class V2ModelUploadInitRequest {
    private String targetAssetId;
    private String fileName;
    private Long fileSize;
    private String fileFingerprint;
    private String modelName;
    private String modelVersion;
    private String taskType;
    private String remark;
}
