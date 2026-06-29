package com.tss.platform.dto.v2;

import lombok.Data;

import java.time.Instant;
import java.util.List;

@Data
public class V2ModelUploadDto {
    private String uploadId;
    private String status;
    private String fileName;
    private Long fileSize;
    private Integer chunkSize;
    private Integer totalChunks;
    private Integer uploadedChunks;
    private Long uploadedBytes;
    private List<Integer> uploadedPartIndexes;
    private String targetAssetId;
    private String modelId;
    private String assetId;
    private String modelName;
    private String modelVersion;
    private String taskType;
    private String remark;
    private Instant createdAt;
    private Instant updatedAt;
}
