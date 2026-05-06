package com.tss.platform.module1.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.tss.platform.module1.entity.OperationLog;

public interface OperationLogService extends IService<OperationLog> {
    // 记录操作日志
    boolean recordLog(OperationLog log);
}
