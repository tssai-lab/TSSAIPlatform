package com.tss.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.dto.DatasetContentPreviewDto;
import com.tss.platform.dto.DatasetPreviewFileDto;
import com.tss.platform.dto.DatasetPreviewFileListDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.model.ZipEntryInfo;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.zip.Inflater;
import java.util.zip.InflaterInputStream;

@Service
public class DatasetPreviewService {

    private static final int DEFAULT_MAX_ZIP_ENTRIES = 10_000;
    private static final int DEFAULT_MAX_TEXT_BYTES = 1024 * 1024;
    private static final long DEFAULT_MAX_IMAGE_BYTES = 20L * 1024L * 1024L;
    private static final int DEFAULT_MAX_PAGE_SIZE = 200;

    private static final String KIND_IMAGE = "IMAGE";
    private static final String KIND_TEXT = "TEXT";
    private static final String KIND_TABLE = "TABLE";
    private static final String KIND_UNSUPPORTED = "UNSUPPORTED";

    private static final Set<String> VALID_KINDS = Set.of(KIND_IMAGE, KIND_TEXT, KIND_TABLE, KIND_UNSUPPORTED);
    private static final Set<String> IMAGE_EXTENSIONS = Set.of(
            ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff"
    );
    private static final Set<String> TEXT_EXTENSIONS = Set.of(".txt", ".json", ".jsonl", ".xml");
    private static final Set<String> TABLE_EXTENSIONS = Set.of(".csv");

    private final DatasetVersionRepository datasetVersionRepo;
    private final DatasetAssetRepository datasetAssetRepo;
    private final MinioService minioService;
    private final ZipCentralDirectoryReader zipReader;
    private final AuthContext authContext;
    private final ObjectMapper objectMapper;
    private final int maxZipEntries;
    private final int maxTextBytes;
    private final long maxImageBytes;
    private final int maxPageSize;

    public DatasetPreviewService(
            DatasetVersionRepository datasetVersionRepo,
            DatasetAssetRepository datasetAssetRepo,
            MinioService minioService,
            AuthContext authContext,
            ObjectMapper objectMapper,
            @Value("${dataset.preview.max-zip-entries:10000}") int maxZipEntries,
            @Value("${dataset.preview.max-text-bytes:1048576}") int maxTextBytes,
            @Value("${dataset.preview.max-image-bytes:20971520}") long maxImageBytes,
            @Value("${dataset.preview.max-page-size:200}") int maxPageSize
    ) {
        this.datasetVersionRepo = datasetVersionRepo;
        this.datasetAssetRepo = datasetAssetRepo;
        this.minioService = minioService;
        this.zipReader = new ZipCentralDirectoryReader(minioService);
        this.authContext = authContext;
        this.objectMapper = objectMapper;
        this.maxZipEntries = maxZipEntries > 0 ? maxZipEntries : DEFAULT_MAX_ZIP_ENTRIES;
        this.maxTextBytes = maxTextBytes > 0 ? maxTextBytes : DEFAULT_MAX_TEXT_BYTES;
        this.maxImageBytes = maxImageBytes > 0 ? maxImageBytes : DEFAULT_MAX_IMAGE_BYTES;
        this.maxPageSize = maxPageSize > 0 ? maxPageSize : DEFAULT_MAX_PAGE_SIZE;
    }

    public DatasetPreviewFileListDto listFiles(
            String datasetVersionId,
            Integer page,
            Integer pageSize,
            String keyword,
            String kind
    ) {
        return listFiles(datasetVersionId, page, pageSize, keyword, kind, PreviewUrlMode.V1);
    }

    public DatasetPreviewFileListDto listFilesForV2(
            String datasetVersionId,
            Integer page,
            Integer pageSize,
            String keyword,
            String kind
    ) {
        requireValidV2Pagination(page, pageSize);
        return listFiles(datasetVersionId, page, pageSize, keyword, kind, PreviewUrlMode.V2);
    }

    private DatasetPreviewFileListDto listFiles(
            String datasetVersionId,
            Integer page,
            Integer pageSize,
            String keyword,
            String kind,
            PreviewUrlMode previewUrlMode
    ) {
        DatasetSource source = getDatasetSource(datasetVersionId);
        int pageNo = resolvePage(page);
        int size = resolvePageSize(pageSize);
        String filterKind = normalizeKind(kind);
        String filterKeyword = normalizeKeyword(keyword);
        boolean archive = isZip(source.sourceName());

        List<DatasetPreviewFileDto> files = archive
                ? listArchiveFiles(source, previewUrlMode)
                : listSingleFile(source, previewUrlMode);
        List<DatasetPreviewFileDto> filtered = files.stream()
                .filter(file -> filterKind == null || filterKind.equals(file.getKind()))
                .filter(file -> matchesKeyword(file, filterKeyword))
                .sorted(Comparator.comparing(DatasetPreviewFileDto::getPath, Comparator.nullsFirst(String::compareTo)))
                .toList();

        DatasetPreviewFileListDto dto = new DatasetPreviewFileListDto();
        dto.setDatasetVersionId(source.version().getId());
        dto.setType(source.asset().getType());
        dto.setFileName(fileNameOf(source.sourceName()));
        dto.setSourceArchive(archive);
        dto.setPage(pageNo);
        dto.setPageSize(size);
        dto.setTotal(filtered.size());
        dto.setFiles(paginate(filtered, pageNo, size));
        return dto;
    }

    public DatasetContentPreviewDto previewContent(
            String datasetVersionId,
            String path,
            Integer page,
            Integer pageSize
    ) {
        DatasetSource source = getDatasetSource(datasetVersionId);
        if (isZip(source.sourceName())) {
            String targetPath = normalizeZipEntryPath(path);
            ZipEntryInfo entry = findArchiveFile(
                    source,
                    targetPath,
                    "dataset archive file does not exist: ",
                    "failed to read dataset archive content"
            );
            try (InputStream entryStream = openArchiveEntryStream(source, entry)) {
                return previewContentStream(entry.normalizedPath(), entryStream, page, pageSize);
            } catch (IllegalArgumentException e) {
                throw e;
            } catch (Exception e) {
                throw new IllegalArgumentException("failed to read dataset archive content: " + rootMessage(e));
            }
        }

        if (path != null && !path.isBlank()) {
            throw new IllegalArgumentException("path is only supported for archive datasets");
        }
        try (InputStream is = minioService.downloadStream(source.version().getStoragePath())) {
            return previewContentStream(null, is, page, pageSize, source.sourceName());
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("failed to read dataset content: " + rootMessage(e));
        }
    }

    public DatasetContentPreviewDto previewContentForV2(
            String datasetVersionId,
            String path,
            Integer page,
            Integer pageSize
    ) {
        requireValidV2Pagination(page, pageSize);
        return previewContent(datasetVersionId, path, page, pageSize);
    }

    public DatasetImageStream openImage(String datasetVersionId, String path) {
        DatasetSource source = getDatasetSource(datasetVersionId);
        if (!"CV".equalsIgnoreCase(source.asset().getType())) {
            throw new IllegalArgumentException("image preview only supports CV datasets");
        }
        if (!isZip(source.sourceName())) {
            throw new IllegalArgumentException("CV image preview only supports archive datasets");
        }

        String targetPath = normalizeZipEntryPath(path);
        if (!KIND_IMAGE.equals(classifyKind(targetPath))) {
            throw new IllegalArgumentException("image preview only supports image files");
        }

        ZipEntryInfo entry = findArchiveFile(
                source,
                targetPath,
                "dataset image does not exist: ",
                "failed to read dataset image"
        );
        if (!isImagePreviewAllowed(entry.uncompressedSize())) {
            throw new IllegalArgumentException(imageTooLargeMessage());
        }
        try (InputStream entryStream = openArchiveEntryStream(source, entry)) {
            return extractImageEntry(entryStream, entry.normalizedPath());
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("failed to read dataset image: " + rootMessage(e));
        }
    }

    private ZipEntryInfo findArchiveFile(
            DatasetSource source,
            String targetPath,
            String missingMessage,
            String failurePrefix
    ) {
        for (ZipEntryInfo entry : readArchiveEntries(source, failurePrefix)) {
            if (!entry.directory() && targetPath.equals(entry.normalizedPath())) {
                return entry;
            }
        }
        throw new IllegalArgumentException(missingMessage + targetPath);
    }

    private List<ZipEntryInfo> readArchiveEntries(DatasetSource source, String failurePrefix) {
        Long objectSize = source.version().getSizeBytes();
        if (objectSize == null || objectSize < 0) {
            try {
                objectSize = minioService.stat(source.version().getStoragePath()).size();
            } catch (Exception exception) {
                throw new IllegalArgumentException(
                        "failed to determine dataset archive size: " + rootMessage(exception),
                        exception
                );
            }
        }
        if (objectSize < 0) {
            throw new IllegalArgumentException("dataset archive size is invalid");
        }
        try {
            List<ZipEntryInfo> entries = zipReader.read(
                    source.version().getStoragePath(),
                    objectSize
            );
            if (entries.size() > maxZipEntries) {
                throw new IllegalArgumentException("dataset zip file contains too many entries");
            }
            return entries;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException(failurePrefix + ": " + rootMessage(e));
        }
    }

    private InputStream openArchiveEntryStream(DatasetSource source, ZipEntryInfo entry)
            throws Exception {
        if (entry.compressedSize() == 0) {
            return new ByteArrayInputStream(new byte[0]);
        }
        InputStream compressed = minioService.downloadRange(
                source.version().getStoragePath(),
                entry.zipDataOffset(),
                entry.compressedSize()
        );
        if (entry.method() == 0) {
            return compressed;
        }
        if (entry.method() == 8) {
            Inflater inflater = new Inflater(true);
            return new InflaterInputStream(compressed, inflater) {
                @Override
                public void close() throws IOException {
                    try {
                        super.close();
                    } finally {
                        inflater.end();
                    }
                }
            };
        }
        try {
            compressed.close();
        } catch (IOException ignored) {
            // Preserve the unsupported method error.
        }
        throw new IllegalArgumentException("unsupported ZIP compression method: " + entry.method());
    }

    private List<DatasetPreviewFileDto> listArchiveFiles(
            DatasetSource source,
            PreviewUrlMode previewUrlMode
    ) {
        return readArchiveEntries(source, "failed to list dataset archive files").stream()
                .filter(entry -> !entry.directory())
                .map(entry -> toPreviewFile(
                        source,
                        entry.normalizedPath(),
                        entry.uncompressedSize(),
                        previewUrlMode
                ))
                .toList();
    }

    private List<DatasetPreviewFileDto> listSingleFile(
            DatasetSource source,
            PreviewUrlMode previewUrlMode
    ) {
        if (!"NLP".equalsIgnoreCase(source.asset().getType())) {
            throw new IllegalArgumentException("non-archive preview only supports NLP datasets");
        }
        return List.of(toPreviewFile(
                source,
                null,
                source.version().getSizeBytes(),
                previewUrlMode
        ));
    }

    private DatasetPreviewFileDto toPreviewFile(
            DatasetSource source,
            String path,
            Long sizeBytes,
            PreviewUrlMode previewUrlMode
    ) {
        String displayName = path == null ? source.sourceName() : path;
        String kind = classifyKind(displayName);
        boolean previewAllowed = isPreviewAllowed(source, kind, sizeBytes);

        DatasetPreviewFileDto dto = new DatasetPreviewFileDto();
        dto.setPath(path);
        dto.setFileName(fileNameOf(displayName));
        dto.setExtension(extensionOf(displayName));
        dto.setKind(kind);
        dto.setSizeBytes(sizeBytes);
        dto.setPreviewAllowed(previewAllowed);
        dto.setPreviewUrl(previewAllowed
                ? previewUrl(source.version().getId(), path, kind, previewUrlMode)
                : null);
        dto.setMessage(previewMessage(source, kind, sizeBytes, previewAllowed));
        return dto;
    }

    private DatasetContentPreviewDto previewContentStream(
            String path,
            InputStream inputStream,
            Integer page,
            Integer pageSize
    ) {
        return previewContentStream(path, inputStream, page, pageSize, path);
    }

    private DatasetContentPreviewDto previewContentStream(
            String path,
            InputStream inputStream,
            Integer page,
            Integer pageSize,
            String fallbackName
    ) {
        String name = path == null ? fallbackName : path;
        String extension = extensionOf(name);
        String kind = classifyKind(name);
        if (!KIND_TEXT.equals(kind) && !KIND_TABLE.equals(kind)) {
            throw new IllegalArgumentException("dataset content preview only supports text, JSON, JSONL, XML, or CSV files");
        }

        LimitedText text = readLimitedText(inputStream);
        if (".csv".equals(extension)) {
            return csvPreview(path, name, extension, text, page, pageSize);
        }
        if (isLinePageable(extension)) {
            return linePreview(path, name, extension, text, page, pageSize);
        }
        return textPreview(path, name, extension, text);
    }

    private DatasetContentPreviewDto textPreview(
            String path,
            String name,
            String extension,
            LimitedText text
    ) {
        String content = text.content();
        String contentType = contentTypeOf(extension);
        if (".json".equals(extension)) {
            try {
                JsonNode json = objectMapper.readTree(content);
                content = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(json);
            } catch (Exception ignored) {
                // Invalid JSON is still useful as raw dataset text.
            }
        }

        DatasetContentPreviewDto dto = baseContentPreview(path, name, extension, contentType, text.truncated());
        dto.setContent(content);
        dto.setColumns(null);
        dto.setRows(null);
        dto.setPage(1);
        dto.setPageSize(null);
        setNonPageable(dto);
        dto.setMessage(text.truncated() ? "content was truncated to the preview size limit" : null);
        return dto;
    }

    private DatasetContentPreviewDto linePreview(
            String path,
            String name,
            String extension,
            LimitedText text,
            Integer page,
            Integer pageSize
    ) {
        int pageNo = resolvePage(page);
        int size = resolvePageSize(pageSize);
        List<String> lines = text.content().lines()
                .filter(line -> !".jsonl".equals(extension) || !line.isBlank())
                .toList();

        DatasetContentPreviewDto dto = baseContentPreview(path, name, extension, contentTypeOf(extension), text.truncated());
        dto.setContent(String.join("\n", paginate(lines, pageNo, size)));
        dto.setColumns(null);
        dto.setRows(null);
        setPageable(dto, pageNo, size, lines.size());
        dto.setMessage(text.truncated() ? "content was truncated to the preview size limit" : null);
        return dto;
    }

    private DatasetContentPreviewDto csvPreview(
            String path,
            String name,
            String extension,
            LimitedText text,
            Integer page,
            Integer pageSize
    ) {
        int pageNo = resolvePage(page);
        int size = resolvePageSize(pageSize);
        List<String> columns = new ArrayList<>();
        List<List<String>> rows = new ArrayList<>();

        try (CSVParser parser = CSVParser.parse(text.content(), CSVFormat.DEFAULT)) {
            List<CSVRecord> records = parser.getRecords();
            if (!records.isEmpty()) {
                columns.addAll(recordValues(records.get(0)));
                for (int i = 1; i < records.size(); i += 1) {
                    rows.add(recordValues(records.get(i)));
                }
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("failed to parse CSV dataset preview: " + rootMessage(e));
        }

        DatasetContentPreviewDto dto = baseContentPreview(path, name, extension, "CSV", text.truncated());
        dto.setContent(null);
        dto.setColumns(columns);
        dto.setRows(paginate(rows, pageNo, size));
        dto.setPage(pageNo);
        dto.setPageSize(size);
        setPageable(dto, pageNo, size, rows.size());
        dto.setMessage(text.truncated() ? "content was truncated to the preview size limit" : null);
        return dto;
    }

    private DatasetContentPreviewDto baseContentPreview(
            String path,
            String name,
            String extension,
            String contentType,
            boolean truncated
    ) {
        DatasetContentPreviewDto dto = new DatasetContentPreviewDto();
        dto.setPath(path);
        dto.setFileName(fileNameOf(name));
        dto.setExtension(extension);
        dto.setContentType(contentType);
        dto.setTruncated(truncated);
        return dto;
    }

    private List<String> recordValues(CSVRecord record) {
        List<String> values = new ArrayList<>();
        for (String value : record) {
            values.add(value);
        }
        return values;
    }

    private boolean isLinePageable(String extension) {
        return ".txt".equals(extension) || ".jsonl".equals(extension);
    }

    private void setPageable(DatasetContentPreviewDto dto, int page, int pageSize, int total) {
        dto.setPage(page);
        dto.setPageSize(pageSize);
        dto.setPageable(true);
        dto.setTotal(total);
        dto.setTotalPages(totalPages(total, pageSize));
    }

    private void setNonPageable(DatasetContentPreviewDto dto) {
        dto.setPageable(false);
        dto.setTotal(null);
        dto.setTotalPages(null);
    }

    private int totalPages(int total, int pageSize) {
        if (total <= 0) {
            return 0;
        }
        return (total + pageSize - 1) / pageSize;
    }

    private LimitedText readLimitedText(InputStream inputStream) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.min(maxTextBytes, 8192));
        byte[] buffer = new byte[8192];
        int total = 0;
        boolean truncated = false;
        try {
            int len;
            while ((len = inputStream.read(buffer)) != -1) {
                int remaining = maxTextBytes - total;
                if (remaining <= 0) {
                    truncated = true;
                    break;
                }
                if (len > remaining) {
                    out.write(buffer, 0, remaining);
                    truncated = true;
                    break;
                }
                out.write(buffer, 0, len);
                total += len;
            }
        } catch (IOException e) {
            throw new IllegalArgumentException("failed to read dataset preview content: " + rootMessage(e));
        }
        return new LimitedText(out.toString(StandardCharsets.UTF_8), truncated);
    }

    private DatasetImageStream extractImageEntry(InputStream entryStream, String entryPath) throws IOException {
        Path tempFile = Files.createTempFile("dataset-preview-image-", safeTempSuffix(extensionOf(entryPath)));
        boolean complete = false;
        long total = 0;
        byte[] buffer = new byte[8192];
        try (OutputStream out = Files.newOutputStream(tempFile, StandardOpenOption.WRITE)) {
            int len;
            while ((len = entryStream.read(buffer)) != -1) {
                total += len;
                if (total > maxImageBytes) {
                    throw new IllegalArgumentException(imageTooLargeMessage());
                }
                out.write(buffer, 0, len);
            }
            complete = true;
        } finally {
            if (!complete) {
                Files.deleteIfExists(tempFile);
            }
        }

        InputStream stream = openDeletingInputStream(tempFile);
        return new DatasetImageStream(stream, fileNameOf(entryPath), imageContentType(entryPath), total);
    }

    private InputStream openDeletingInputStream(Path tempFile) throws IOException {
        try {
            InputStream delegate = Files.newInputStream(
                    tempFile,
                    StandardOpenOption.READ,
                    StandardOpenOption.DELETE_ON_CLOSE
            );
            return new FilterInputStream(delegate) {
                @Override
                public void close() throws IOException {
                    IOException failure = null;
                    try {
                        super.close();
                    } catch (IOException exception) {
                        failure = exception;
                    }
                    try {
                        Files.deleteIfExists(tempFile);
                    } catch (IOException exception) {
                        if (failure == null) {
                            failure = exception;
                        } else {
                            failure.addSuppressed(exception);
                        }
                    }
                    if (failure != null) {
                        throw failure;
                    }
                }
            };
        } catch (IOException | RuntimeException exception) {
            Files.deleteIfExists(tempFile);
            throw exception;
        }
    }

    private DatasetSource getDatasetSource(String datasetVersionId) {
        if (datasetVersionId == null || datasetVersionId.isBlank()) {
            throw new IllegalArgumentException("datasetVersionId cannot be empty");
        }
        DatasetVersion version = datasetVersionRepo.findByIdAndDeletedFalse(datasetVersionId.trim())
                .orElseThrow(() -> previewNotFound("dataset not found or no permission"));
        DatasetAsset asset = datasetAssetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(() -> previewNotFound("dataset not found or no permission"));

        Integer ownerUserId = version.getOwnerUserId() != null ? version.getOwnerUserId() : asset.getOwnerUserId();
        requireOwnerAccess(ownerUserId);
        requirePreviewableStatus(version);
        if (!"CV".equalsIgnoreCase(asset.getType()) && !"NLP".equalsIgnoreCase(asset.getType())) {
            throw previewNotPreviewable(
                    "common dataset preview only supports CV or NLP datasets; use point cloud preview for POINT_CLOUD datasets"
            );
        }
        requireStoragePath(version);
        requireObjectAccess(version.getStoragePath(), ownerUserId);
        return new DatasetSource(version, asset, sourceName(version));
    }

    private void requirePreviewableStatus(DatasetVersion version) {
        String status = version.getStatus();
        if (!"READY".equals(status) && !"DEPRECATED".equals(status)) {
            throw previewNotPreviewable(
                    "dataset version status must be READY or DEPRECATED for preview"
            );
        }
    }

    private void requireStoragePath(DatasetVersion version) {
        if (version.getStoragePath() == null || version.getStoragePath().isBlank()) {
            throw previewNotPreviewable("dataset version storage path is empty");
        }
    }

    private void requireOwnerAccess(Integer ownerUserId) {
        try {
            authContext.requireOwnerAccess(ownerUserId, "dataset not found or no permission");
        } catch (IllegalArgumentException exception) {
            throw previewNotFound("dataset not found or no permission", exception);
        }
    }

    private void requireObjectAccess(String storagePath, Integer ownerUserId) {
        try {
            authContext.requireObjectAccess(
                    storagePath,
                    ownerUserId,
                    "dataset not found or no permission"
            );
        } catch (IllegalArgumentException exception) {
            throw previewNotFound("dataset not found or no permission", exception);
        }
    }

    private DatasetPreviewAccessException previewNotFound(String message) {
        return new DatasetPreviewAccessException(
                DatasetPreviewAccessException.Reason.NOT_FOUND,
                message
        );
    }

    private DatasetPreviewAccessException previewNotFound(String message, Throwable cause) {
        return new DatasetPreviewAccessException(
                DatasetPreviewAccessException.Reason.NOT_FOUND,
                message,
                cause
        );
    }

    private DatasetPreviewAccessException previewNotPreviewable(String message) {
        return new DatasetPreviewAccessException(
                DatasetPreviewAccessException.Reason.NOT_PREVIEWABLE,
                message
        );
    }

    private boolean isPreviewAllowed(DatasetSource source, String kind, Long sizeBytes) {
        if (KIND_TEXT.equals(kind) || KIND_TABLE.equals(kind)) {
            return true;
        }
        if (KIND_IMAGE.equals(kind)) {
            return "CV".equalsIgnoreCase(source.asset().getType()) && isImagePreviewAllowed(sizeBytes);
        }
        return false;
    }

    private boolean isImagePreviewAllowed(Long sizeBytes) {
        return sizeBytes == null || sizeBytes <= maxImageBytes;
    }

    private String previewMessage(DatasetSource source, String kind, Long sizeBytes, boolean previewAllowed) {
        if (previewAllowed) {
            return null;
        }
        if (KIND_IMAGE.equals(kind) && "CV".equalsIgnoreCase(source.asset().getType()) && !isImagePreviewAllowed(sizeBytes)) {
            return imageTooLargeMessage();
        }
        if (KIND_IMAGE.equals(kind)) {
            return "image preview only supports CV datasets";
        }
        return "this file type does not support online preview yet; please download and view locally";
    }

    private String previewUrl(
            String datasetVersionId,
            String path,
            String kind,
            PreviewUrlMode previewUrlMode
    ) {
        if (previewUrlMode == PreviewUrlMode.V2) {
            String base = "/api/v2/dataset-versions/"
                    + queryEncode(datasetVersionId)
                    + (KIND_IMAGE.equals(kind) ? "/preview/image" : "/preview/content");
            return path == null ? base : base + "?path=" + queryEncode(path);
        }
        String base = KIND_IMAGE.equals(kind) ? "/api/dataset/preview/image" : "/api/dataset/preview/content";
        String url = base + "?id=" + queryEncode(datasetVersionId);
        if (path != null) {
            url += "&path=" + queryEncode(path);
        }
        return url;
    }

    private enum PreviewUrlMode {
        V1,
        V2
    }

    private String normalizeKind(String kind) {
        if (kind == null || kind.isBlank()) {
            return null;
        }
        String normalized = kind.trim().toUpperCase(Locale.ROOT);
        if (!VALID_KINDS.contains(normalized)) {
            throw new IllegalArgumentException("kind only supports IMAGE, TEXT, TABLE, or UNSUPPORTED");
        }
        return normalized;
    }

    private String classifyKind(String path) {
        String ext = extensionOf(path);
        if (IMAGE_EXTENSIONS.contains(ext)) {
            return KIND_IMAGE;
        }
        if (TEXT_EXTENSIONS.contains(ext)) {
            return KIND_TEXT;
        }
        if (TABLE_EXTENSIONS.contains(ext)) {
            return KIND_TABLE;
        }
        return KIND_UNSUPPORTED;
    }

    private String contentTypeOf(String extension) {
        return switch (extension) {
            case ".json" -> "JSON";
            case ".jsonl" -> "JSONL";
            case ".xml" -> "XML";
            default -> "TEXT";
        };
    }

    private String imageContentType(String path) {
        return switch (extensionOf(path)) {
            case ".jpg", ".jpeg" -> "image/jpeg";
            case ".png" -> "image/png";
            case ".gif" -> "image/gif";
            case ".webp" -> "image/webp";
            case ".bmp" -> "image/bmp";
            case ".tif", ".tiff" -> "image/tiff";
            default -> "application/octet-stream";
        };
    }

    private String normalizeZipEntryPath(String path) {
        return ZipPathValidator.normalizeEntryPath(path);
    }

    private String sourceName(DatasetVersion version) {
        if (version.getFileName() != null && !version.getFileName().isBlank()) {
            return version.getFileName();
        }
        return version.getStoragePath();
    }

    private boolean isZip(String path) {
        return ".zip".equals(extensionOf(path));
    }

    private boolean matchesKeyword(DatasetPreviewFileDto file, String keyword) {
        if (keyword == null) {
            return true;
        }
        return containsIgnoreCase(file.getPath(), keyword)
                || containsIgnoreCase(file.getFileName(), keyword)
                || containsIgnoreCase(file.getExtension(), keyword);
    }

    private boolean containsIgnoreCase(String value, String keyword) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(keyword);
    }

    private String normalizeKeyword(String keyword) {
        return keyword == null || keyword.isBlank() ? null : keyword.trim().toLowerCase(Locale.ROOT);
    }

    private int resolvePage(Integer page) {
        return page != null && page > 0 ? page : 1;
    }

    private int resolvePageSize(Integer pageSize) {
        if (pageSize == null || pageSize <= 0) {
            return 100;
        }
        return Math.min(pageSize, maxPageSize);
    }

    private void requireValidV2Pagination(Integer page, Integer pageSize) {
        if (page != null && page <= 0) {
            throw new IllegalArgumentException("page must be greater than or equal to 1");
        }
        if (pageSize != null && pageSize <= 0) {
            throw new IllegalArgumentException("pageSize must be greater than or equal to 1");
        }
    }

    private <T> List<T> paginate(List<T> source, int page, int pageSize) {
        if (source.isEmpty()) {
            return List.of();
        }
        long requestedOffset = ((long) page - 1L) * pageSize;
        int from = requestedOffset >= source.size()
                ? source.size()
                : Math.toIntExact(requestedOffset);
        int to = (int) Math.min((long) from + pageSize, source.size());
        return source.subList(from, to);
    }

    private String fileNameOf(String path) {
        if (path == null || path.isBlank()) {
            return "";
        }
        String normalized = path.replace('\\', '/');
        int index = normalized.lastIndexOf('/');
        return index >= 0 ? normalized.substring(index + 1) : normalized;
    }

    private String extensionOf(String path) {
        String fileName = fileNameOf(path);
        int index = fileName.lastIndexOf('.');
        return index >= 0 ? fileName.substring(index).toLowerCase(Locale.ROOT) : "";
    }

    private String safeTempSuffix(String extension) {
        return extension == null || extension.isBlank() ? ".tmp" : extension;
    }

    private String imageTooLargeMessage() {
        return "image file is too large for online preview; please download and view locally";
    }

    private String queryEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private String rootMessage(Throwable e) {
        Throwable current = e;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        return current.getMessage() == null ? e.getMessage() : current.getMessage();
    }

    public record DatasetImageStream(
            InputStream inputStream,
            String fileName,
            String contentType,
            Long sizeBytes
    ) {
    }

    private record LimitedText(String content, boolean truncated) {
    }

    private record DatasetSource(DatasetVersion version, DatasetAsset asset, String sourceName) {
    }
}
