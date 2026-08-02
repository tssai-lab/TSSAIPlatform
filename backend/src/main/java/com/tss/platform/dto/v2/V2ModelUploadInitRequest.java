package com.tss.platform.dto.v2;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Map;

@Data
public class V2ModelUploadInitRequest {
    private String targetAssetId;
    private String fileName;
    private Long fileSize;
    private String fileFingerprint;
    private String modelName;
    private String modelVersion;
    @Schema(
            description = "上传者声明的模型任务类型（CV、NLP、POINT_CLOUD 或 ROBOT）；"
                    + "服务端不从权重二进制内容推断或校验实际模态",
            example = "CV",
            allowableValues = {"CV", "NLP", "POINT_CLOUD", "ROBOT"}
    )
    private String taskType;
    private String remark;
    private String commitInfo;
    private Map<String, Object> hyperParams;
}
