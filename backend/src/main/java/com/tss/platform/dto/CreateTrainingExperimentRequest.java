package com.tss.platform.dto;

import lombok.Data;

@Data
public class CreateTrainingExperimentRequest {
    private String name;
    private String modelVersionId;
    private String codeVersionId;
    private String datasetVersionId;
    private Object hyperParams;
    private Object params;
    private String remark;
}
