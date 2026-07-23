package com.tss.platform.service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.model.CvAnnotationFormat;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.awt.image.BufferedImage;
import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class DatasetZipValidator {

    private static final Set<String> CV_IMAGE_EXTENSIONS = Set.of(
            ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff"
    );
    private static final Set<String> NLP_ALLOWED_EXTENSIONS = Set.of(
            ".txt", ".json", ".jsonl", ".csv", ".xlsx", ".xls", ".pdf", ".docx", ".xml"
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
    private static final Set<String> YOLO_METADATA_FILES = Set.of(
            "classes.txt", "train.txt", "val.txt", "test.txt"
    );
    private static final int MAX_DATASET_ZIP_ENTRIES = 100_000;
    private static final long MAX_DATASET_UNCOMPRESSED_BYTES = 50L * 1024 * 1024 * 1024;
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

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
        String lower = normalizedFileName(fileName);
        if (lower.endsWith(".zip")) {
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

        try (InputStream input = minioClient.getObject(
                GetObjectArgs.builder().bucket(bucket).object(objectName).build()
        )) {
            validateSingleFileContent(
                    taskType,
                    annotationFormat,
                    lower,
                    input,
                    objectSize
            );
        }
        return 1L;
    }

    static void validateSingleFileContent(
            String taskType,
            String annotationFormat,
            String fileName,
            InputStream input,
            long expectedSize
    ) throws Exception {
        Path temp = Files.createTempFile("dataset-object-validation-", ".tmp");
        try {
            long actualSize = copyToTemp(input, temp, 0L);
            if (expectedSize >= 0 && actualSize != expectedSize) {
                throw new IllegalArgumentException(
                        "dataset object size does not match upload metadata"
                );
            }
            try {
                validateDeclaredContent(
                        taskType,
                        annotationFormat,
                        normalizedFileName(fileName),
                        temp
                );
            } catch (IllegalArgumentException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new IllegalArgumentException(
                        "dataset file content could not be parsed: " + fileName,
                        exception
                );
            }
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    static void validateDatasetFileNameForTask(String taskType, String fileName) {
        String lower = normalizedFileName(fileName);
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
        String lower = normalizedFileName(fileName);
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
        Set<String> paths = new HashSet<>();
        Set<String> yoloImages = new HashSet<>();
        Set<String> yoloLabels = new HashSet<>();
        Set<String> yoloMetadataCandidates = new HashSet<>();
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
                String canonicalPath = canonicalEntryPath(entryName);
                if (!paths.add(canonicalPath)) {
                    throw new IllegalArgumentException("数据集 zip 包含重复路径: " + entryName);
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
                        boolean image = CV_IMAGE_EXTENSIONS.contains(ext);
                        foundCvImage = foundCvImage || image;
                        foundCvAnnotation = foundCvAnnotation
                                || CvAnnotationFormat.isAnnotationFile(annotationFormat, ext);
                        if ("YOLO".equals(annotationFormat)) {
                            if (image && !yoloImages.add(yoloKey(entryName, "images"))) {
                                throw new IllegalArgumentException("YOLO zip contains duplicate image mapping: " + entryName);
                            }
                            if (".txt".equals(ext)) {
                                String labelKey = yoloKey(entryName, "labels");
                                if (isYoloMetadataCandidate(entryName)) {
                                    yoloMetadataCandidates.add(labelKey);
                                } else if (!yoloLabels.add(labelKey)) {
                                    throw new IllegalArgumentException(
                                            "YOLO zip contains duplicate label mapping: " + entryName
                                    );
                                }
                            }
                        }
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

                    Path temp = Files.createTempFile("dataset-entry-validation-", ".tmp");
                    try {
                        long entryBytes = copyToTemp(zip, temp, totalUncompressedBytes);
                        totalUncompressedBytes += entryBytes;
                        validateDeclaredContent(taskType, annotationFormat, entryName, temp);
                    } finally {
                        Files.deleteIfExists(temp);
                    }
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
            if ("YOLO".equals(annotationFormat)) {
                for (String candidate : yoloMetadataCandidates) {
                    if (yoloImages.contains(candidate) && !yoloLabels.add(candidate)) {
                        throw new IllegalArgumentException(
                                "YOLO zip contains duplicate label mapping: " + candidate
                        );
                    }
                }
            }
            if ("YOLO".equals(annotationFormat) && !yoloImages.equals(yoloLabels)) {
                Set<String> missingLabels = new HashSet<>(yoloImages);
                missingLabels.removeAll(yoloLabels);
                Set<String> missingImages = new HashSet<>(yoloLabels);
                missingImages.removeAll(yoloImages);
                throw new IllegalArgumentException(
                        "YOLO image/label mapping mismatch; missingLabels=" + missingLabels
                                + ", missingImages=" + missingImages
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

    private static void validateDeclaredContent(
            String taskType,
            String annotationFormat,
            String fileName,
            Path file
    ) throws Exception {
        String ext = extensionOf(fileName);
        if (CV_IMAGE_EXTENSIONS.contains(ext)) {
            validateImage(fileName, ext, file);
            return;
        }
        switch (ext) {
            case ".json" -> validateJson(fileName, file);
            case ".jsonl" -> validateJsonLines(fileName, file);
            case ".xml" -> validateXml(fileName, file);
            case ".txt", ".csv", ".yaml", ".yml" -> validateUtf8Text(fileName, file);
            case ".pdf" -> requireMagic(fileName, file, "%PDF-".getBytes(StandardCharsets.US_ASCII));
            case ".xls" -> requireMagic(fileName, file, new byte[]{
                    (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0,
                    (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1
            });
            case ".docx" -> validateOfficePackage(fileName, file, "word/");
            case ".xlsx" -> validateOfficePackage(fileName, file, "xl/");
            default -> {
                // PLY/PCD may be either text or binary. Their structural parsers remain downstream.
            }
        }
    }

    private static void validateImage(String fileName, String extension, Path file) throws IOException {
        try (ImageInputStream imageInput = ImageIO.createImageInputStream(file.toFile())) {
            if (imageInput == null) {
                throw new IllegalArgumentException("image cannot be decoded: " + fileName);
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(imageInput);
            if (!readers.hasNext()) {
                throw new IllegalArgumentException("image cannot be decoded: " + fileName);
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(imageInput, true, true);
                BufferedImage image = reader.read(0);
                if (image == null || image.getWidth() <= 0 || image.getHeight() <= 0) {
                    throw new IllegalArgumentException("image cannot be decoded: " + fileName);
                }
                if (!formatMatchesExtension(reader.getFormatName(), extension)) {
                    throw new IllegalArgumentException("image content does not match extension: " + fileName);
                }
            } finally {
                reader.dispose();
            }
        }
    }

    private static boolean formatMatchesExtension(String formatName, String extension) {
        String format = formatName == null ? "" : formatName.toLowerCase(Locale.ROOT);
        return switch (extension) {
            case ".jpg", ".jpeg" -> format.contains("jpeg") || format.contains("jpg");
            case ".tif", ".tiff" -> format.contains("tif");
            default -> format.contains(extension.substring(1));
        };
    }

    private static void validateJson(String fileName, Path file) throws IOException {
        validateUtf8Text(fileName, file);
        try (InputStream input = Files.newInputStream(file)) {
            if (JSON.readTree(input) == null) {
                throw new IllegalArgumentException("JSON document is empty: " + fileName);
            }
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("invalid JSON: " + fileName, exception);
        }
    }

    private static void validateJsonLines(String fileName, Path file) throws IOException {
        validateUtf8Text(fileName, file);
        boolean found = false;
        try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line;
            int lineNumber = 0;
            while ((line = reader.readLine()) != null) {
                lineNumber += 1;
                if (line.isBlank()) {
                    continue;
                }
                found = true;
                try {
                    if (JSON.readTree(line) == null) {
                        throw new IllegalArgumentException("empty JSON value");
                    }
                } catch (Exception exception) {
                    throw new IllegalArgumentException(
                            "invalid JSONL at " + fileName + ":" + lineNumber,
                            exception
                    );
                }
            }
        }
        if (!found) {
            throw new IllegalArgumentException("JSONL document has no records: " + fileName);
        }
    }

    private static void validateXml(String fileName, Path file) throws Exception {
        validateUtf8Text(fileName, file);
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        try {
            factory.newDocumentBuilder().parse(file.toFile());
        } catch (Exception exception) {
            throw new IllegalArgumentException("invalid XML: " + fileName, exception);
        }
    }

    private static void validateUtf8Text(String fileName, Path file) throws IOException {
        rejectBinaryMagic(fileName, file);
        var decoder = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        try (InputStreamReader reader = new InputStreamReader(Files.newInputStream(file), decoder)) {
            char[] chars = new char[8192];
            int read;
            while ((read = reader.read(chars)) != -1) {
                for (int i = 0; i < read; i += 1) {
                    char value = chars[i];
                    if (value == '\0'
                            || (Character.isISOControl(value)
                            && value != '\t'
                            && value != '\n'
                            && value != '\r')) {
                        throw new IllegalArgumentException("text file contains binary control bytes: " + fileName);
                    }
                }
            }
        } catch (CharacterCodingException exception) {
            throw new IllegalArgumentException("text file is not valid UTF-8: " + fileName, exception);
        }
    }

    private static void rejectBinaryMagic(String fileName, Path file) throws IOException {
        byte[] prefix;
        try (InputStream input = Files.newInputStream(file)) {
            prefix = input.readNBytes(12);
        }
        if (startsWith(prefix, new byte[]{(byte) 0x89, 'P', 'N', 'G'})
                || startsWith(prefix, new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF})
                || startsWith(prefix, "GIF8".getBytes(StandardCharsets.US_ASCII))
                || startsWith(prefix, "%PDF-".getBytes(StandardCharsets.US_ASCII))
                || startsWith(prefix, new byte[]{'P', 'K', 0x03, 0x04})
                || startsWith(prefix, new byte[]{
                (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0
        })
                || startsWith(prefix, new byte[]{0x7F, 'E', 'L', 'F'})
                || startsWith(prefix, new byte[]{'M', 'Z'})) {
            throw new IllegalArgumentException(
                    "text file contains binary content: " + fileName
            );
        }
    }

    private static boolean startsWith(byte[] value, byte[] prefix) {
        if (value.length < prefix.length) {
            return false;
        }
        for (int index = 0; index < prefix.length; index += 1) {
            if (value[index] != prefix[index]) {
                return false;
            }
        }
        return true;
    }

    private static void requireMagic(String fileName, Path file, byte[] expected) throws IOException {
        byte[] actual;
        try (InputStream input = Files.newInputStream(file)) {
            actual = input.readNBytes(expected.length);
        }
        if (actual.length != expected.length) {
            throw new IllegalArgumentException("file content does not match extension: " + fileName);
        }
        for (int i = 0; i < expected.length; i += 1) {
            if (actual[i] != expected[i]) {
                throw new IllegalArgumentException("file content does not match extension: " + fileName);
            }
        }
    }

    private static void validateOfficePackage(String fileName, Path file, String requiredPrefix)
            throws IOException {
        boolean contentTypes = false;
        boolean requiredPart = false;
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(Files.newInputStream(file)))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = normalizeZipEntryName(entry.getName());
                contentTypes = contentTypes || "[Content_Types].xml".equals(name);
                requiredPart = requiredPart || name.startsWith(requiredPrefix);
                zip.closeEntry();
            }
        }
        if (!contentTypes || !requiredPart) {
            throw new IllegalArgumentException("Office document content does not match extension: " + fileName);
        }
    }

    private static long copyToTemp(InputStream input, Path temp, long currentTotal) throws IOException {
        long copied = 0;
        byte[] buffer = new byte[8192];
        try (OutputStream output = Files.newOutputStream(temp)) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                copied += read;
                if (currentTotal + copied > MAX_DATASET_UNCOMPRESSED_BYTES) {
                    throw new IllegalArgumentException("数据集 zip 解压后体积过大");
                }
                output.write(buffer, 0, read);
            }
        }
        return copied;
    }

    private static String yoloKey(String name, String marker) {
        String normalized = normalizeZipEntryName(name).toLowerCase(Locale.ROOT);
        String[] parts = normalized.split("/");
        StringBuilder key = new StringBuilder();
        boolean markerRemoved = false;
        for (String part : parts) {
            if (!markerRemoved && marker.equals(part)) {
                markerRemoved = true;
                continue;
            }
            if (key.length() > 0) {
                key.append('/');
            }
            key.append(part);
        }
        String value = key.toString();
        String extension = extensionOf(value);
        return extension.isEmpty() ? value : value.substring(0, value.length() - extension.length());
    }

    private static boolean isYoloMetadata(String name) {
        String normalized = normalizeZipEntryName(name).toLowerCase(Locale.ROOT);
        int slash = normalized.lastIndexOf('/');
        String leaf = slash >= 0 ? normalized.substring(slash + 1) : normalized;
        return YOLO_METADATA_FILES.contains(leaf);
    }

    private static boolean isYoloMetadataCandidate(String name) {
        if (!isYoloMetadata(name)) {
            return false;
        }
        String normalized = normalizeZipEntryName(name).toLowerCase(Locale.ROOT);
        for (String part : normalized.split("/")) {
            if ("labels".equals(part)) {
                return false;
            }
        }
        return true;
    }

    private static String canonicalEntryPath(String name) {
        String normalized = normalizeZipEntryName(name);
        while (normalized.endsWith("/") && !normalized.isEmpty()) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private static String normalizedFileName(String fileName) {
        return fileName == null ? "" : fileName.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeZipEntryName(String name) {
        return name == null ? "" : name.replace('\\', '/');
    }
}
