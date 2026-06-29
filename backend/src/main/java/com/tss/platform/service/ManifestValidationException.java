package com.tss.platform.service;

import java.util.Map;

public class ManifestValidationException extends IllegalArgumentException {

    private final String errorCode;
    private final Map<String, Object> details;

    public ManifestValidationException(String message) {
        this("INVALID_MANIFEST", message, Map.of(), null);
    }

    public ManifestValidationException(String message, Throwable cause) {
        this("INVALID_MANIFEST", message, Map.of(), cause);
    }

    public ManifestValidationException(
            String errorCode,
            String message,
            Map<String, Object> details
    ) {
        this(errorCode, message, details, null);
    }

    public ManifestValidationException(
            String errorCode,
            String message,
            Map<String, Object> details,
            Throwable cause
    ) {
        super(message, cause);
        this.errorCode = errorCode == null || errorCode.isBlank()
                ? "INVALID_MANIFEST"
                : errorCode;
        this.details = details == null ? Map.of() : Map.copyOf(details);
    }

    public String getErrorCode() {
        return errorCode;
    }

    public Map<String, Object> getDetails() {
        return details;
    }
}
