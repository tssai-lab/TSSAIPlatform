package com.tss.platform.dto.v2;

import lombok.Data;

@Data
public class V2ImportJobStatusDto {
    private String importJobId;
    private String status;
    private String displayStatus;
    private Integer importProgress;
    private V2UserError userError;
}
