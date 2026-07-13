package com.tss.platform.service;

import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

/**
 * Normalizes code paths without resolving semantic components and validates virtual-file trees.
 */
@Component
public final class CodePathPolicy {

    public static final int MAX_PATH_CHARACTERS = 1_024;

    public String normalizeFilePath(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            throw invalidPath();
        }
        String normalized = rawPath.replace('\\', '/');
        if (normalized.length() > MAX_PATH_CHARACTERS) {
            throw invalidPath();
        }
        if (normalized.startsWith("/")
                || normalized.matches("^[A-Za-z]:.*")
                || normalized.endsWith("/")) {
            throw invalidPath();
        }
        String[] components = normalized.split("/", -1);
        for (String component : components) {
            if (component.isBlank()
                    || ".".equals(component)
                    || "..".equals(component)
                    || component.indexOf('\0') >= 0) {
                throw invalidPath();
            }
        }
        return normalized;
    }

    /**
     * Normalizes a virtual directory prefix. Root is represented by the empty
     * string; non-root prefixes never end with a slash.
     */
    public String normalizeDirectoryPrefix(String rawPrefix) {
        if (rawPrefix == null || rawPrefix.isBlank() || "/".equals(rawPrefix)) {
            return "";
        }
        String normalized = rawPrefix.replace('\\', '/');
        if (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (normalized.isBlank()
                || normalized.length() > MAX_PATH_CHARACTERS
                || normalized.startsWith("/")
                || normalized.matches("^[A-Za-z]:.*")) {
            throw invalidPath();
        }
        String[] components = normalized.split("/", -1);
        for (String component : components) {
            if (component.isBlank()
                    || ".".equals(component)
                    || "..".equals(component)
                    || component.indexOf('\0') >= 0) {
                throw invalidPath();
            }
        }
        return normalized;
    }

    public void validateNoTreeConflicts(Collection<String> normalizedFilePaths) {
        if (normalizedFilePaths == null) {
            throw invalidPath();
        }
        Set<String> paths = new HashSet<>();
        for (String rawPath : normalizedFilePaths) {
            String path = normalizeFilePath(rawPath);
            if (!paths.add(path)) {
                throw new CodeValidationException("DUPLICATE_PATH", "Code archive contains duplicate paths");
            }
        }
        for (String path : paths) {
            int slash = path.indexOf('/');
            while (slash >= 0) {
                if (paths.contains(path.substring(0, slash))) {
                    throw new CodeValidationException(
                            "TREE_CONFLICT",
                            "Code archive contains a file-directory conflict"
                    );
                }
                slash = path.indexOf('/', slash + 1);
            }
        }
    }

    private static CodeValidationException invalidPath() {
        return new CodeValidationException("INVALID_PATH", "Code file path is invalid");
    }
}
