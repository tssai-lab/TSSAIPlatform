package com.tss.platform.service;

import com.tss.platform.model.CvAnnotationFormat;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class DatasetZipValidator {

    private static final Set<String> CV_IMAGE_EXTENSIONS = Set.of(
            ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff"
    );
    private static final Set<String> NLP_ALLOWED_EXTENSIONS = Set.of(
            ".txt", ".json", ".jsonl", ".csv", ".xlsx", ".xls", ".pdf", ".docx", ".xml",
            ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff"
    );
    private static final Set<String> POINT_CLOUD_EXTENSIONS = Set.of(
            ".ply", ".pcd"
    );
    private static final Set<String> POINT_CLOUD_ZIP_ALLOWED_EXTENSIONS = Set.of(
            ".ply", ".pcd", ".txt", ".json", ".yaml", ".yml"
    );
    private static final Set<String> ROBOT_ALLOWED_EXTENSIONS = Set.of(
            ".xml", ".yaml", ".yml"
    );
    private static final Set<String> ROBOT_ZIP_ALLOWED_EXTENSIONS = Set.of(
            ".xml", ".yaml", ".yml", ".json", ".txt"
    );
    private static final int MAX_DATASET_ZIP_ENTRIES = 100_000;
    private static final long MAX_DATASET_UNCOMPRESSED_BYTES = 50L * 1024 * 1024 * 1024;

    private final MinioClient minioClient;
    private final String bucket;
    private ZipCentralDirectoryReader zipCentralDirectoryReader;

    DatasetZipValidator(MinioClient minioClient, String bucket) {
        this.minioClient = minioClient;
        this.bucket = bucket;
    }

    void setZipCentralDirectoryReader(ZipCentralDirectoryReader zipCentralDirectoryReader) {
        this.zipCentralDirectoryReader = zipCentralDirectoryReader;
    }

    Long validateDatasetObjectFormat(
            String taskType,
            String annotationFormat,
            String fileName,
            String objectName,
            long objectSize
    ) throws Exception {
        String lower = fileName == null ? "" : fileName.trim().toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".zip")) {
            return 1L;
        }
        long streamedFileCount;
        try (InputStream is = minioClient.getObject(
                GetObjectArgs.builder().bucket(bucket).object(objectName).build()
        )) {
            streamedFileCount = validateDatasetZipEntries(taskType, annotationFormat, is);
        }
        if (zipCentralDirectoryReader == null) {
            return streamedFileCount;
        }
        return zipCentralDirectoryReader.read(objectName, objectSize).stream()
                .filter(entry -> !entry.directory())
                .count();
    }

    static void validateDatasetFileNameForTask(String taskType, String fileName) {
        String lower = fileName == null ? "" : fileName.trim().toLowerCase(Locale.ROOT);
        if ("CV".equals(taskType)) {
            if (!lower.endsWith(".zip")) {
                throw new IllegalArgumentException("CV 数据集仅支持 zip 压缩包，压缩包内需包含图片文件");
            }
            return;
        }
        if ("NLP".equals(taskType)) {
            if (!lower.endsWith(".zip") && !NLP_ALLOWED_EXTENSIONS.contains(extensionOf(lower))) {
                throw new IllegalArgumentException(
                        "NLP dataset only supports .txt, .json, .jsonl, .csv, .xlsx, .xls, .pdf, .docx, .xml, or zip containing these files"
                );
            }
            return;
        }
        if ("POINT_CLOUD".equals(taskType)) {
            if (!lower.endsWith(".zip") && !POINT_CLOUD_EXTENSIONS.contains(extensionOf(lower))) {
                throw new IllegalArgumentException(
                        "POINT_CLOUD dataset only supports .ply, .pcd, or zip containing .ply/.pcd files"
                );
            }
            return;
        }
        if ("ROBOT".equals(taskType)) {
            if (!lower.endsWith(".zip") && !ROBOT_ALLOWED_EXTENSIONS.contains(extensionOf(lower))) {
                throw new IllegalArgumentException(
                        "ROBOT dataset only supports .xml, .yaml, .yml, or zip containing robot metadata files"
                );
            }
            return;
        }
        if ("MULTIMODAL".equals(taskType) && !lower.endsWith(".zip")) {
            throw new IllegalArgumentException("MULTIMODAL 数据集仅支持 zip 压缩包");
        }
    }

    static void validateAppendPackageFileNameForTask(String taskType, String fileName) {
        String lower = fileName == null ? "" : fileName.trim().toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".zip")) {
            throw new IllegalArgumentException("append package only supports zip files");
        }
        validateDatasetFileNameForTask(taskType, fileName);
    }

    static long validateDatasetZipEntries(
            String taskType,
            String annotationFormat,
            InputStream inputStream
    ) throws Exception {
        boolean found = false;
        boolean foundCvImage = false;
        boolean foundCvAnnotation = false;
        boolean foundPointCloud = false;
        int entries = 0;
        long files = 0;
        long totalUncompressedBytes = 0;
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(inputStream))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries += 1;
                if (entries > MAX_DATASET_ZIP_ENTRIES) {
                    throw new IllegalArgumentException("数据集 zip 文件条目过多");
                }
                String entryName = normalizeZipEntryName(entry.getName());
                if (!ZipPathValidator.isSafeEntryPath(entryName)) {
                    throw new IllegalArgumentException("数据集 zip 包含非法路径: " + entry.getName());
                }
                if (!entry.isDirectory()) {
                    files += 1;
                    String ext = extensionOf(entryName);
                    if ("CV".equals(taskType)) {
                        if (!CvAnnotationFormat.isAllowedFile(annotationFormat, ext)) {
                            throw new IllegalArgumentException(
                                    "CV zip dataset does not allow file for annotationFormat "
                                            + annotationFormat + ": " + entryName
                            );
                        }
                        foundCvImage = foundCvImage || CV_IMAGE_EXTENSIONS.contains(ext);
                        foundCvAnnotation = foundCvAnnotation
                                || CvAnnotationFormat.isAnnotationFile(annotationFormat, ext);
                        found = true;
                    } else if ("NLP".equals(taskType)) {
                        if (!NLP_ALLOWED_EXTENSIONS.contains(ext)) {
                            throw new IllegalArgumentException(
                                    "NLP zip dataset only allows .txt, .json, .jsonl, .csv, .xlsx, .xls, .pdf, .docx, or .xml files: "
                                            + entryName
                            );
                        }
                        found = true;
                    } else if ("POINT_CLOUD".equals(taskType)) {
                        if (!POINT_CLOUD_ZIP_ALLOWED_EXTENSIONS.contains(ext)) {
                            throw new IllegalArgumentException(
                                    "POINT_CLOUD zip dataset only allows .ply, .pcd, .txt, .json, .yaml, or .yml files: "
                                            + entryName
                            );
                        }
                        foundPointCloud = foundPointCloud || POINT_CLOUD_EXTENSIONS.contains(ext);
                        found = true;
                    } else if ("ROBOT".equals(taskType)) {
                        if (!ROBOT_ZIP_ALLOWED_EXTENSIONS.contains(ext)) {
                            throw new IllegalArgumentException(
                                    "ROBOT zip dataset only allows .xml, .yaml, .yml, .json, or .txt files: "
                                            + entryName
                            );
                        }
                        found = true;
                    } else {
                        throw new IllegalArgumentException(taskType + " zip dataset format is not supported");
                    }
                    totalUncompressedBytes = drainZipEntry(zip, totalUncompressedBytes);
                }
                zip.closeEntry();
            }
        }
        if ("CV".equals(taskType)) {
            if (!foundCvImage) {
                throw new IllegalArgumentException("CV zip dataset must contain image files");
            }
            if (CvAnnotationFormat.requiresAnnotationFile(annotationFormat) && !foundCvAnnotation) {
                throw new IllegalArgumentException(
                        "CV zip dataset must contain annotation files for annotationFormat " + annotationFormat
                );
            }
        }
        if ("POINT_CLOUD".equals(taskType) && !foundPointCloud) {
            throw new IllegalArgumentException("POINT_CLOUD zip dataset must contain .ply or .pcd files");
        }
        if (!found) {
            if ("CV".equals(taskType)) {
                throw new IllegalArgumentException("CV zip 数据集必须包含图片文件");
            }
            if ("NLP".equals(taskType)) {
                throw new IllegalArgumentException(
                        "NLP zip dataset must contain .txt, .json, .jsonl, .csv, .xlsx, .xls, .pdf, .docx, or .xml files"
                );
            }
            if ("ROBOT".equals(taskType)) {
                throw new IllegalArgumentException(
                        "ROBOT zip dataset must contain .xml, .yaml, .yml, .json, or .txt files"
                );
            }
        }
        return files;
    }

    static boolean isCvImageExtension(String extension) {
        return CV_IMAGE_EXTENSIONS.contains(extension);
    }

    static String extensionOf(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        int index = lower.lastIndexOf('.');
        return index >= 0 ? lower.substring(index) : "";
    }

    private static long drainZipEntry(ZipInputStream zip, long currentTotal) throws Exception {
        byte[] buffer = new byte[8192];
        long total = currentTotal;
        int len;
        while ((len = zip.read(buffer)) != -1) {
            total += len;
            if (total > MAX_DATASET_UNCOMPRESSED_BYTES) {
                throw new IllegalArgumentException("数据集 zip 解压后体积过大");
            }
        }
        return total;
    }

    private static String normalizeZipEntryName(String name) {
        return name == null ? "" : name.replace('\\', '/');
    }
}
