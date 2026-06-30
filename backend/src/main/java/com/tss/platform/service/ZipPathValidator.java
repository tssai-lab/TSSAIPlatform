package com.tss.platform.service;

final class ZipPathValidator {

    private ZipPathValidator() {
    }

    static String normalizeEntryPath(String path) {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("zip entry path cannot be empty");
        }
        if (path.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("zip entry path is illegal");
        }
        String normalized = path.replace('\\', '/');
        if (normalized.startsWith("/") || normalized.matches("^[A-Za-z]:.*")) {
            throw new IllegalArgumentException("zip entry path is illegal: " + path);
        }
        boolean hasSegment = false;
        for (String part : normalized.split("/", -1)) {
            if (part.isEmpty()) {
                continue;
            }
            hasSegment = true;
            if ("..".equals(part) || part.indexOf('\0') >= 0) {
                throw new IllegalArgumentException("zip entry path is illegal: " + path);
            }
        }
        if (!hasSegment) {
            throw new IllegalArgumentException("zip entry path cannot be empty");
        }
        return normalized;
    }

    static boolean isSafeEntryPath(String path) {
        try {
            normalizeEntryPath(path);
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}
