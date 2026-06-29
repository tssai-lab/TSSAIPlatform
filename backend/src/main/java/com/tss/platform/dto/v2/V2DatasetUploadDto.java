package com.tss.platform.dto.v2;

import lombok.Data;

import java.time.Instant;
import java.util.List;

@Data
public class V2DatasetUploadDto {
    private String uploadId;
    private String status;
    private String fileName;
    private Long fileSize;
    private Integer chunkSize;
    private Integer totalChunks;
    private Integer uploadedChunks;
    private Long uploadedBytes;
    private List<Integer> uploadedPartIndexes;
    private String datasetId;
    private String editSessionId;
    private String versionLabel;
    private String displayStatus;
    private Integer importProgress;
    private V2UserError userError;
    private Instant createdAt;
    private Instant updatedAt;
}
