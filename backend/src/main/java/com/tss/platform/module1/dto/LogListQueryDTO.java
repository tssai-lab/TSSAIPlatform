package com.tss.platform.module1.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class LogListQueryDTO {
    private Integer pageNum = 1;
    private Integer pageSize = 10;
    private String username;
    private String operateType;
    private LocalDateTime operateTimeStart;
    private LocalDateTime operateTimeEnd;
    private String ip;
    private String result;
    /** system | operation */
    private String logType;
    /** super_admin | normal_admin */
    private String currentUserRole;
    /** 个人中心：仅查当前用户 */
    private String currentUsername;
    private String content;
}
