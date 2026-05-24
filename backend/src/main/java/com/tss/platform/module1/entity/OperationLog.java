package com.tss.platform.module1.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("operation_logs")
public class OperationLog {
    @TableId(type = IdType.AUTO)
    private Integer id;
    private Integer userId;
    private String userName;
    private String operationType;
    private String operationObj;
    private String ipAddress;
    private LocalDateTime operationTime;
    private String remarks;
    private String status;
}
