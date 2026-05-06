package com.tss.platform.dto;

import lombok.Data;

@Data
public class UploadInitRequest {
    private String fileName;
    private Long fileSize;
    private String fileFingerprint;
}
