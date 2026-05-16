package com.tss.platform.module1.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.tss.platform.module1.entity.OperationLog;

public interface OperationLogService extends IService<OperationLog> {
    boolean recordLog(OperationLog log);
    IPage<OperationLog> queryLogs(OperationLogQueryDTO queryDTO);
}
