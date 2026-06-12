package com.tss.platform.service;

public class ManifestValidationException extends IllegalArgumentException {

    public ManifestValidationException(String message) {
        super(message);
    }

    public ManifestValidationException(String message, Throwable cause) {
        super(message, cause);
    }
}
