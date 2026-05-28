package com.tss.platform.module1.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.tss.platform.module1.dto.OperationLogQueryDTO;
import com.tss.platform.module1.entity.OperationLog;
import com.tss.platform.module1.mapper.OperationLogMapper;
import com.tss.platform.module1.service.OperationLogService;
import org.springframework.stereotype.Service;

@Service
public class OperationLogServiceImpl extends ServiceImpl<OperationLogMapper, OperationLog> implements OperationLogService {

    @Override
    public boolean recordLog(OperationLog log) {
        log.setOperationTime(java.time.LocalDateTime.now());
        return save(log);
    }

    @Override
    public IPage<OperationLog> queryLogs(OperationLogQueryDTO queryDTO) {
        Page<OperationLog> page = new Page<>(queryDTO.getPage(), queryDTO.getSize());
        
        LambdaQueryWrapper<OperationLog> wrapper = new LambdaQueryWrapper<>();
        
        if (queryDTO.getUserId() != null) {
            wrapper.eq(OperationLog::getUserId, queryDTO.getUserId());
        }
        if (queryDTO.getOperationType() != null && !queryDTO.getOperationType().isBlank()) {
            wrapper.eq(OperationLog::getOperationType, queryDTO.getOperationType());
        }
        if (queryDTO.getOperationObj() != null && !queryDTO.getOperationObj().isBlank()) {
            wrapper.eq(OperationLog::getOperationObj, queryDTO.getOperationObj());
        }
        if (queryDTO.getStatus() != null && !queryDTO.getStatus().isBlank()) {
            wrapper.eq(OperationLog::getStatus, queryDTO.getStatus());
        }
        if (queryDTO.getStartTime() != null) {
            wrapper.ge(OperationLog::getOperationTime, queryDTO.getStartTime());
        }
        if (queryDTO.getEndTime() != null) {
            wrapper.le(OperationLog::getOperationTime, queryDTO.getEndTime());
        }
        
        wrapper.orderByDesc(OperationLog::getOperationTime);
        
        return page(page, wrapper);
    }
}
