package com.tss.platform.dto;

import lombok.Data;

@Data
public class UploadCompleteRequest {
    private String uploadId;
    private String modelName;
    private String version;
    private String type;
    private String remark;
}
