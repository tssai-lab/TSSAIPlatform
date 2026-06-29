package com.tss.platform.service;

import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 基础模型权重 ZIP 内容校验：路径安全、扩展名白名单/黑名单、体积与条目限制。
 * 权重包仅作为文件输入，不执行其中任何脚本。
 */
final class ModelWeightZipValidator {

    static final int MAX_ENTRIES = 10_000;
    static final long MAX_UNCOMPRESSED_BYTES = 50L * 1024 * 1024 * 1024;
    static final long MAX_SINGLE_FILE_BYTES = 2L * 1024 * 1024 * 1024;

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            ".pt",
            ".pth",
            ".onnx",
            ".pkl",
            ".joblib",
            ".yaml",
            ".yml",
            ".json",
            ".txt",
            ".md"
    );

    private static final Set<String> BLOCKED_EXTENSIONS = Set.of(
            ".py",
            ".sh",
            ".bash",
            ".exe",
            ".bat",
            ".cmd",
            ".dll",
            ".so",
            ".jar"
    );

    private ModelWeightZipValidator() {
    }

    static void validate(ZipInputStream zip) throws Exception {
        int entries = 0;
        boolean foundFile = false;
        long totalUncompressedBytes = 0;
        ZipEntry entry;
        while ((entry = zip.getNextEntry()) != null) {
            entries += 1;
            if (entries > MAX_ENTRIES) {
                throw new IllegalArgumentException("模型权重 zip 文件条目过多");
            }
            String entryName = CodeModelZipValidator.normalizeZipEntryName(entry.getName());
            if (!CodeModelZipValidator.isSafeZipEntryPath(entryName)) {
                throw new IllegalArgumentException("模型权重 zip 包含非法路径: " + entry.getName());
            }
            if (!entry.isDirectory()) {
                foundFile = true;
                validateFileExtension(entryName);
                totalUncompressedBytes = drainZipEntry(zip, totalUncompressedBytes, entry.getSize());
            }
            zip.closeEntry();
        }
        if (!foundFile) {
            throw new IllegalArgumentException("模型权重 zip 不能为空");
        }
    }

    private static void validateFileExtension(String entryName) {
        String ext = extensionOf(entryName);
        if (ext == null || ext.isEmpty()) {
            throw new IllegalArgumentException("模型权重包包含无扩展名文件: " + entryName);
        }
        if (BLOCKED_EXTENSIONS.contains(ext)) {
            throw new IllegalArgumentException("模型权重包不允许脚本或可执行文件: " + entryName);
        }
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw new IllegalArgumentException("模型权重包包含不支持的文件类型: " + entryName);
        }
    }

    private static long drainZipEntry(ZipInputStream zip, long currentTotal, long declaredSize) throws Exception {
        byte[] buffer = new byte[8192];
        long total = currentTotal;
        long fileBytes = 0;
        int len;
        while ((len = zip.read(buffer)) != -1) {
            total += len;
            fileBytes += len;
            if (total > MAX_UNCOMPRESSED_BYTES) {
                throw new IllegalArgumentException("模型权重 zip 解压后总体积过大");
            }
            if (fileBytes > MAX_SINGLE_FILE_BYTES) {
                throw new IllegalArgumentException("模型权重 zip 单文件体积过大");
            }
        }
        if (declaredSize > 0 && fileBytes > declaredSize) {
            throw new IllegalArgumentException("模型权重 zip 条目大小异常: " + fileBytes);
        }
        return total;
    }

    private static String extensionOf(String entryName) {
        if (entryName == null || entryName.isBlank()) {
            return null;
        }
        int slash = entryName.lastIndexOf('/');
        String fileName = slash >= 0 ? entryName.substring(slash + 1) : entryName;
        int dot = fileName.lastIndexOf('.');
        if (dot <= 0 || dot == fileName.length() - 1) {
            return null;
        }
        return fileName.substring(dot).toLowerCase(Locale.ROOT);
    }
}
