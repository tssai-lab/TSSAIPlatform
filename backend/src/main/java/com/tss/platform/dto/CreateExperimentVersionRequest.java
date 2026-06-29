package com.tss.platform.dto;

import lombok.Data;

@Data
public class CreateExperimentVersionRequest {
    private String name;
    /** 基础模型权重版本（API 别名，落库到 modelVersionId） */
    private String baseModelVersionId;
    private String modelVersionId;
    private String codeVersionId;
    private String datasetVersionId;
    private Object hyperParams;
    private Object params;
    private String remark;
}
