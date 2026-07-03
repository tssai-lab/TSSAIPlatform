package com.tss.platform.service;

import com.tss.platform.controller.v2.V2BusinessException;
import com.tss.platform.dto.ImportJobStatusDto;
import com.tss.platform.dto.v2.V2ImportJobStatusDto;
import com.tss.platform.dto.v2.V2UserError;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;

@Service
public class V2ImportJobService {

    private static final Set<String> IMPORTING_STATUSES = Set.of("PENDING", "RUNNING");

    private final ImportJobQueryService importJobQueryService;

    public V2ImportJobService(ImportJobQueryService importJobQueryService) {
        this.importJobQueryService = importJobQueryService;
    }

    public V2ImportJobStatusDto retry(String importJobId, String mode) {
        try {
            return toV2(importJobQueryService.retry(importJobId, mode));
        } catch (ImportJobQueryService.ImportJobAccessException exception) {
            throw new V2BusinessException(
                    HttpStatus.NOT_FOUND,
                    "IMPORT_JOB_NOT_FOUND",
                    "导入任务不存在或无权访问"
            );
        } catch (ImportJobQueryService.ImportJobRetryRejectedException exception) {
            throw new V2BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "IMPORT_JOB_NOT_RETRYABLE",
                    "当前导入任务不可重试",
                    reasonDetails(exception)
            );
        } catch (IllegalArgumentException exception) {
            throw new V2BusinessException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_IMPORT_JOB_RETRY",
                    "导入任务重试请求无效",
                    reasonDetails(exception)
            );
        }
    }

    private Map<String, Object> reasonDetails(RuntimeException exception) {
        String message = exception.getMessage() == null ? "" : exception.getMessage();
        if (message.isBlank()) {
            return Map.of();
        }
        return Map.of("reason", message);
    }

    private V2ImportJobStatusDto toV2(ImportJobStatusDto source) {
        V2ImportJobStatusDto dto = new V2ImportJobStatusDto();
        dto.setImportJobId(source.getImportJobId());
        dto.setStatus(source.getStatus());
        dto.setDisplayStatus(displayStatus(source.getStatus()));
        dto.setImportProgress(source.getProgress());
        dto.setUserError(userError(source));
        return dto;
    }

    private String displayStatus(String status) {
        if ("FAILED".equals(status)) {
            return "IMPORT_FAILED";
        }
        if (IMPORTING_STATUSES.contains(status)) {
            return "IMPORTING";
        }
        if ("SUCCESS".equals(status)) {
            return "READY";
        }
        return status;
    }

    private V2UserError userError(ImportJobStatusDto source) {
        if (!"FAILED".equals(source.getStatus())) {
            return null;
        }
        return new V2UserError(
                source.getErrorCode() == null ? "IMPORT_FAILED" : source.getErrorCode(),
                source.getErrorMessage() == null
                        ? "数据导入失败，请检查上传内容后重试"
                        : source.getErrorMessage(),
                Map.of()
        );
    }
}
