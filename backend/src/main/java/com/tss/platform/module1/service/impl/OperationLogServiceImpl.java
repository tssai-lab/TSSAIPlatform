package com.tss.platform.module1.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.tss.platform.module1.entity.OperationLog;
import com.tss.platform.module1.mapper.OperationLogMapper;
import com.tss.platform.module1.service.OperationLogService;
import org.springframework.stereotype.Service;

@Service
public class OperationLogServiceImpl extends ServiceImpl<OperationLogMapper, OperationLog> implements OperationLogService {

    @Override
    public boolean recordLog(OperationLog log) {
        // 自动填充操作时间
        log.setOperationTime(java.time.LocalDateTime.now());
        return save(log);
    }
}
