package com.tss.platform.module1.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class OperationLogQueryDTO {
    private Integer page = 1;
    private Integer size = 10;
    private Integer userId;
    private String operationType;
    private String operationObj;
    private String status;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
}
