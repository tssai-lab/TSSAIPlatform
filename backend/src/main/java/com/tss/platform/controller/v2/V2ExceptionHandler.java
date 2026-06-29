package com.tss.platform.controller.v2;

import com.tss.platform.service.ManifestValidationException;
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
                Map.of(),
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
                .body(V2ErrorResponse.failure(code, message, details, traceId));
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
}
