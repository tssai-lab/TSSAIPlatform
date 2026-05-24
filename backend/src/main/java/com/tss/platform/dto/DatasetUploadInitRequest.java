package com.tss.platform.dto;

import lombok.Data;

@Data
public class DatasetUploadInitRequest {
    private String fileName;
    private Long fileSize;
    private String fileFingerprint;
    private String datasetName;
    private String version;
    private String type;
    private String remark;
}
