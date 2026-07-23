package com.tss.platform.service;

import io.minio.StatObjectResponse;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;

@Service
public class ModelArtifactIntegrityService {

    private final MinioService minioService;

    public ModelArtifactIntegrityService(MinioService minioService) {
        this.minioService = minioService;
    }

    public Inspection inspect(String objectName, Long expectedSize) {
        if (objectName == null || objectName.isBlank()) {
            throw new ModelArtifactException("model artifact storagePath is blank", false);
        }
        if (expectedSize == null || expectedSize <= 0) {
            throw new ModelArtifactException("model artifact size metadata is invalid", false);
        }
        StatObjectResponse stat;
        try {
            stat = minioService.stat(objectName);
        } catch (Exception exception) {
            throw storageException("model artifact could not be inspected", exception);
        }
        if (stat.size() != expectedSize) {
            throw new ModelArtifactException("model artifact size does not match metadata", false);
        }

        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
        long actualSize = 0;
        try (InputStream input = minioService.downloadStream(objectName)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
                actualSize += read;
            }
        } catch (Exception exception) {
            throw storageException("model artifact could not be read", exception);
        }
        if (actualSize != expectedSize) {
            throw new ModelArtifactException("model artifact length changed while hashing", false);
        }
        return new Inspection(
                actualSize,
                HexFormat.of().formatHex(digest.digest())
        );
    }

    private static ModelArtifactException storageException(
            String message,
            Exception exception
    ) {
        String root = rootMessage(exception).toLowerCase(Locale.ROOT);
        boolean missing = root.contains("nosuchkey")
                || root.contains("no such key")
                || root.contains("not found")
                || root.contains("404");
        return new ModelArtifactException(message, !missing, exception);
    }

    private static String rootMessage(Throwable throwable) {
        Throwable current = throwable;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        return current.getMessage() == null
                ? current.getClass().getSimpleName()
                : current.getMessage();
    }

    public record Inspection(long sizeBytes, String sha256) {
    }
}
