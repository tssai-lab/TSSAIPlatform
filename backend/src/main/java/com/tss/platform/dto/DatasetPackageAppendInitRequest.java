package com.tss.platform.dto;

import lombok.Data;

@Data
public class DatasetPackageAppendInitRequest {
    private String fileName;
    private Long fileSize;
    private String fileFingerprint;
    private String sampleGrouping;
    private String manifestPath;
}
