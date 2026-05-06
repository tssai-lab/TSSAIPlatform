package com.tss.platform.dto;

import lombok.Data;

@Data
public class CreateExperimentVersionRequest {
    private String name;
    private String modelVersionId;
    private String codeVersionId;
    private String datasetVersionId;
    private Object hyperParams;
    private Object params;
    private String remark;
}
