package com.tss.platform.controller.v2;

import com.tss.platform.service.ManifestValidationException;
import com.tss.platform.service.DatasetPreviewAccessException;
import com.tss.platform.service.DatasetWorkspaceAuditService;
import com.tss.platform.service.ImportJobQueryService;
import com.tss.platform.service.SampleFileException;
import com.tss.platform.service.SampleService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;
import java.util.UUID;

@Slf4j
@RestControllerAdvice(basePackages = "com.tss.platform.controller.v2")
public class V2ExceptionHandler {

    private static final String TRACE_HEADER = "X-Trace-Id";

    @ExceptionHandler(V2BusinessException.class)
    public ResponseEntity<V2ErrorResponse> handleBusiness(
            V2BusinessException exception,
            HttpServletRequest request
    ) {
        return response(
                exception.getStatus(),
                exception.getErrorCode(),
                exception.getMessage(),
                exception.getDetails(),
                request
        );
    }

    @ExceptionHandler(ManifestValidationException.class)
    public ResponseEntity<V2ErrorResponse> handleManifest(
            ManifestValidationException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.UNPROCESSABLE_ENTITY,
                exception.getErrorCode(),
                exception.getMessage(),
                exception.getDetails(),
                request
        );
    }

    @ExceptionHandler(SampleFileException.class)
    public ResponseEntity<V2ErrorResponse> handleSampleFile(
            SampleFileException exception,
            HttpServletRequest request
    ) {
        Map<String, Object> details = exception.getRangeTotal() == null
                ? Map.of()
                : Map.of("rangeTotal", exception.getRangeTotal());
        ResponseEntity<V2ErrorResponse> response = response(
                exception.getStatus(),
                "SAMPLE_FILE_ERROR",
                exception.getMessage(),
                details,
                request
        );
        if (exception.getStatus() != HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE
                || exception.getRangeTotal() == null) {
            return response;
        }
        return ResponseEntity.status(response.getStatusCode())
                .headers(response.getHeaders())
                .header(HttpHeaders.CONTENT_RANGE, "bytes */" + exception.getRangeTotal())
                .body(response.getBody());
    }

    @ExceptionHandler(DatasetPreviewAccessException.class)
    public ResponseEntity<V2ErrorResponse> handleDatasetPreviewAccess(
            DatasetPreviewAccessException exception,
            HttpServletRequest request
    ) {
        if (exception.getReason() == DatasetPreviewAccessException.Reason.NOT_FOUND) {
            return response(
                    HttpStatus.NOT_FOUND,
                    "DATASET_NOT_FOUND",
                    "数据集版本不存在或无权访问",
                    Map.of(),
                    request
            );
        }
        return response(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "DATASET_NOT_PREVIEWABLE",
                "该数据集版本当前不可预览",
                Map.of(),
                request
        );
    }

    @ExceptionHandler(ImportJobQueryService.ImportJobAccessException.class)
    public ResponseEntity<V2ErrorResponse> handleImportJobAccess(
            ImportJobQueryService.ImportJobAccessException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.NOT_FOUND,
                "IMPORT_JOB_NOT_FOUND",
                "导入任务不存在或无权访问",
                Map.of(),
                request
        );
    }

    @ExceptionHandler(ImportJobQueryService.ImportJobRetryRejectedException.class)
    public ResponseEntity<V2ErrorResponse> handleImportJobRetryRejected(
            ImportJobQueryService.ImportJobRetryRejectedException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "IMPORT_JOB_NOT_RETRYABLE",
                "当前导入任务不可重试",
                reasonDetails(exception),
                request
        );
    }

    @ExceptionHandler(SampleService.DatasetVersionAccessException.class)
    public ResponseEntity<V2ErrorResponse> handleDatasetVersionAccess(
            SampleService.DatasetVersionAccessException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.NOT_FOUND,
                "DATASET_NOT_FOUND",
                "数据集版本不存在或无权访问",
                Map.of(),
                request
        );
    }

    @ExceptionHandler(SampleService.DatasetSampleAccessException.class)
    public ResponseEntity<V2ErrorResponse> handleDatasetSampleAccess(
            SampleService.DatasetSampleAccessException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.NOT_FOUND,
                "DATASET_SAMPLE_NOT_FOUND",
                "数据集样本不存在或无权访问",
                Map.of(),
                request
        );
    }

    @ExceptionHandler(DatasetWorkspaceAuditService.DatasetWorkspaceAuditAccessException.class)
    public ResponseEntity<V2ErrorResponse> handleWorkspaceAuditAccess(
            DatasetWorkspaceAuditService.DatasetWorkspaceAuditAccessException exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.NOT_FOUND,
                "DATASET_AUDIT_NOT_FOUND",
                "数据集审计日志不存在或无权访问",
                Map.of(),
                request
        );
    }

    @ExceptionHandler({
            IllegalArgumentException.class,
            MethodArgumentNotValidException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class
    })
    public ResponseEntity<V2ErrorResponse> handleBadRequest(
            Exception exception,
            HttpServletRequest request
    ) {
        return response(
                HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST",
                safeBadRequestMessage(exception),
                badRequestDetails(exception),
                request
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<V2ErrorResponse> handleUnexpected(
            Exception exception,
            HttpServletRequest request
    ) {
        String traceId = traceId(request);
        log.error(
                "Unexpected V2 API failure: traceId={}, method={}, path={}",
                traceId,
                request.getMethod(),
                request.getRequestURI(),
                exception
        );
        return response(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务暂时不可用，请稍后重试",
                Map.of(),
                traceId
        );
    }

    private ResponseEntity<V2ErrorResponse> response(
            HttpStatus status,
            String code,
            String message,
            Map<String, Object> details,
            HttpServletRequest request
    ) {
        return response(status, code, message, details, traceId(request));
    }

    private ResponseEntity<V2ErrorResponse> response(
            HttpStatus status,
            String code,
            String message,
            Map<String, Object> details,
            String traceId
    ) {
        return ResponseEntity.status(status)
                .header(TRACE_HEADER, traceId)
                .body(V2ErrorResponse.failure(
                        code,
                        message,
                        V2ErrorDetailsSanitizer.sanitizeDetails(details, message),
                        traceId
                ));
    }

    private static String traceId(HttpServletRequest request) {
        String supplied = request.getHeader(TRACE_HEADER);
        if (supplied != null && !supplied.isBlank() && supplied.length() <= 128) {
            return supplied.trim();
        }
        return UUID.randomUUID().toString().replace("-", "");
    }

    private static String safeBadRequestMessage(Exception exception) {
        return exception instanceof IllegalArgumentException
                ? "请求参数不正确，请检查后重试"
                : "请求参数格式不正确";
    }

    private static Map<String, Object> badRequestDetails(Exception exception) {
        if (exception instanceof IllegalArgumentException illegalArgumentException) {
            return V2ErrorDetailsSanitizer.reasonDetails(
                    illegalArgumentException,
                    "请求参数不正确，请检查后重试"
            );
        }
        return Map.of();
    }

    private static Map<String, Object> reasonDetails(RuntimeException exception) {
        return V2ErrorDetailsSanitizer.reasonDetails(
                exception,
                "请求暂时无法完成，请稍后重试"
        );
    }
}
