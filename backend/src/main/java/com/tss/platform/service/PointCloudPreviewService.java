package com.tss.platform.service;

import com.tss.platform.dto.PointCloudPreviewDto;
import com.tss.platform.dto.PointCloudPreviewFileDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.model.ZipEntryInfo;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
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
import java.util.zip.CRC32;
import java.util.zip.Inflater;
import java.util.zip.InflaterInputStream;

@Service
public class PointCloudPreviewService {

    private static final long DEFAULT_MAX_PREVIEW_SIZE = 200L * 1024L * 1024L;
    private static final int MAX_ZIP_ENTRIES = 10_000;
    private static final Set<String> POINT_CLOUD_EXTENSIONS = Set.of(".ply", ".pcd");

    private final DatasetVersionRepository datasetVersionRepo;
    private final DatasetAssetRepository datasetAssetRepo;
    private final MinioService minioService;
    private final AuthContext authContext;
    private final ZipCentralDirectoryReader zipReader;
    private final long maxPreviewSize;

    public PointCloudPreviewService(
            DatasetVersionRepository datasetVersionRepo,
            DatasetAssetRepository datasetAssetRepo,
            MinioService minioService,
            AuthContext authContext,
            @Value("${point-cloud.preview.max-size:209715200}") long maxPreviewSize
    ) {
        this.datasetVersionRepo = datasetVersionRepo;
        this.datasetAssetRepo = datasetAssetRepo;
        this.minioService = minioService;
        this.authContext = authContext;
        this.zipReader = new ZipCentralDirectoryReader(minioService);
        this.maxPreviewSize = maxPreviewSize > 0 ? maxPreviewSize : DEFAULT_MAX_PREVIEW_SIZE;
    }

    public PointCloudPreviewDto preview(String datasetVersionId) {
        return preview(datasetVersionId, PreviewUrlMode.V1);
    }

    public PointCloudPreviewDto previewForV2(String datasetVersionId) {
        return preview(datasetVersionId, PreviewUrlMode.V2);
    }

    private PointCloudPreviewDto preview(
            String datasetVersionId,
            PreviewUrlMode previewUrlMode
    ) {
        PointCloudDataset dataset = getPointCloudDataset(datasetVersionId);
        DatasetVersion version = dataset.version();
        String sourceName = sourceName(version);
        String ext = extensionOf(sourceName);

        PointCloudPreviewDto dto = basePreview(version, sourceName);
        if (".ply".equals(ext) || ".pcd".equals(ext)) {
            dto.setFormat(formatOf(ext));
            Long sizeBytes = resolveObjectSize(version);
            dto.setSizeBytes(sizeBytes);
            if (isPreviewAllowed(sizeBytes)) {
                dto.setPreviewSupported(true);
                dto.setPreviewUrl(singleFilePreviewUrl(
                        version.getId(),
                        previewUrlMode
                ));
            } else {
                dto.setPreviewSupported(false);
                dto.setMessage(tooLargeMessage());
            }
            return dto;
        }

        if (".zip".equals(ext)) {
            dto.setFormat("ZIP");
            fillZipPreview(dto, version, previewUrlMode);
            return dto;
        }

        dto.setPreviewSupported(false);
        dto.setMessage("点云在线预览仅支持 .ply、.pcd 或包含点云文件的 .zip 数据集");
        return dto;
    }

    public PointCloudFileStream openPointCloudFile(String datasetVersionId) {
        PointCloudDataset dataset = getPointCloudDataset(datasetVersionId);
        DatasetVersion version = dataset.version();
        String sourceName = sourceName(version);
        String ext = extensionOf(sourceName);
        if (!POINT_CLOUD_EXTENSIONS.contains(ext)) {
            throw new IllegalArgumentException("仅支持直接预览 .ply 或 .pcd 点云文件");
        }

        Long sizeBytes = resolveObjectSize(version);
        if (!isPreviewAllowed(sizeBytes)) {
            throw new IllegalArgumentException(tooLargeMessage());
        }

        try {
            return new PointCloudFileStream(
                    minioService.downloadStream(version.getStoragePath()),
                    fileNameOf(sourceName),
                    formatOf(ext),
                    sizeBytes
            );
        } catch (Exception e) {
            throw new IllegalArgumentException("读取点云文件失败: " + rootMessage(e));
        }
    }

    public PointCloudFileStream openZipPointCloudFile(String datasetVersionId, String zipEntryPath) {
        PointCloudDataset dataset = getPointCloudDataset(datasetVersionId);
        DatasetVersion version = dataset.version();
        String sourceName = sourceName(version);
        if (!".zip".equals(extensionOf(sourceName))) {
            throw new IllegalArgumentException("仅支持从 POINT_CLOUD zip 数据集读取内部点云文件");
        }

        String targetPath = normalizeZipEntryPath(zipEntryPath);
        String targetExt = extensionOf(targetPath);
        if (!POINT_CLOUD_EXTENSIONS.contains(targetExt)) {
            throw new IllegalArgumentException("zip 内点云预览仅支持 .ply 或 .pcd 文件");
        }

        ZipEntryInfo targetEntry = null;
        for (ZipEntryInfo entry : readZipEntries(version, "读取点云 zip 文件失败")) {
            if (!entry.directory() && targetPath.equals(entry.normalizedPath())) {
                targetEntry = entry;
                break;
            }
        }
        if (targetEntry == null) {
            throw new IllegalArgumentException("zip 内点云文件不存在: " + targetPath);
        }
        if (!isPreviewAllowed(targetEntry.uncompressedSize())) {
            throw new IllegalArgumentException(tooLargeMessage());
        }

        try (InputStream entryStream = openZipEntryStream(version, targetEntry)) {
            return extractEntryToTempStream(entryStream, targetEntry, targetPath);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("读取点云 zip 文件失败: " + rootMessage(e));
        }
    }

    private void fillZipPreview(
            PointCloudPreviewDto dto,
            DatasetVersion version,
            PreviewUrlMode previewUrlMode
    ) {
        List<PointCloudPreviewFileDto> files = new ArrayList<>();
        for (ZipEntryInfo entry : readZipEntries(version, "读取点云 zip 目录失败")) {
            if (!entry.directory()
                    && POINT_CLOUD_EXTENSIONS.contains(extensionOf(entry.normalizedPath()))) {
                files.add(toPreviewFile(
                        version.getId(),
                        entry.normalizedPath(),
                        entry.uncompressedSize(),
                        previewUrlMode
                ));
            }
        }

        files.sort(Comparator.comparing(PointCloudPreviewFileDto::getPath));
        dto.setPointCloudFiles(files);
        if (files.isEmpty()) {
            dto.setPreviewSupported(false);
            dto.setMessage("zip 内未找到 .ply 或 .pcd 点云文件");
            return;
        }

        boolean hasAllowedFile = files.stream().anyMatch(PointCloudPreviewFileDto::isPreviewAllowed);
        dto.setPreviewSupported(hasAllowedFile);
        dto.setMessage(hasAllowedFile ? "请选择 zip 内的点云文件进行预览" : tooLargeMessage());
    }

    private PointCloudPreviewFileDto toPreviewFile(
            String datasetVersionId,
            String entryPath,
            long sizeBytes,
            PreviewUrlMode previewUrlMode
    ) {
        String ext = extensionOf(entryPath);
        boolean previewAllowed = isPreviewAllowed(sizeBytes);

        PointCloudPreviewFileDto dto = new PointCloudPreviewFileDto();
        dto.setPath(entryPath);
        dto.setFileName(fileNameOf(entryPath));
        dto.setFormat(formatOf(ext));
        dto.setSizeBytes(sizeBytes);
        dto.setPreviewAllowed(previewAllowed);
        dto.setPreviewUrl(previewAllowed
                ? zipFilePreviewUrl(datasetVersionId, entryPath, previewUrlMode)
                : null);
        dto.setMessage(previewAllowed ? null : tooLargeMessage());
        return dto;
    }

    private List<ZipEntryInfo> readZipEntries(DatasetVersion version, String failurePrefix) {
        Long objectSize = resolveObjectSize(version);
        if (objectSize == null || objectSize < 0) {
            throw new IllegalArgumentException("无法确定点云 zip 文件大小");
        }
        try {
            return zipReader.read(
                    version.getStoragePath(),
                    objectSize,
                    MAX_ZIP_ENTRIES
            );
        } catch (IllegalArgumentException exception) {
            if (exception.getMessage() != null
                    && exception.getMessage().contains("ZIP entry path")) {
                throw new IllegalArgumentException("zip entry path 非法", exception);
            }
            if (exception.getMessage() != null
                    && exception.getMessage().startsWith("ZIP entry count exceeds")) {
                throw new IllegalArgumentException("点云 zip 文件条目过多", exception);
            }
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException(failurePrefix + ": " + rootMessage(exception), exception);
        }
    }

    private InputStream openZipEntryStream(DatasetVersion version, ZipEntryInfo entry) throws Exception {
        if (entry.compressedSize() == 0) {
            return new ByteArrayInputStream(new byte[0]);
        }
        InputStream compressed = minioService.downloadRange(
                version.getStoragePath(),
                entry.zipDataOffset(),
                entry.compressedSize()
        );
        if (entry.method() == ZipEntryInfoMethod.STORED) {
            return compressed;
        }
        if (entry.method() == ZipEntryInfoMethod.DEFLATED) {
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
            // Preserve the unsupported compression method error.
        }
        throw new IllegalArgumentException("不支持的 zip 压缩方法: " + entry.method());
    }

    private PointCloudFileStream extractEntryToTempStream(
            InputStream entryStream,
            ZipEntryInfo entry,
            String entryPath
    )
            throws IOException {
        if (!isPreviewAllowed(entry.uncompressedSize())) {
            throw new IllegalArgumentException(tooLargeMessage());
        }

        Path tempFile = Files.createTempFile("point-cloud-preview-", extensionOf(entryPath));
        boolean complete = false;
        long total = 0;
        CRC32 crc32 = new CRC32();
        byte[] buffer = new byte[8192];
        try (OutputStream out = Files.newOutputStream(tempFile, StandardOpenOption.WRITE)) {
            int len;
            while ((len = entryStream.read(buffer)) != -1) {
                total += len;
                if (total > maxPreviewSize) {
                    throw new IllegalArgumentException(tooLargeMessage());
                }
                out.write(buffer, 0, len);
                crc32.update(buffer, 0, len);
            }
            if (total != entry.uncompressedSize() || crc32.getValue() != entry.crc32()) {
                throw new IllegalArgumentException("点云 zip 条目校验失败");
            }
            complete = true;
        } finally {
            if (!complete) {
                Files.deleteIfExists(tempFile);
            }
        }

        InputStream stream = openDeletingInputStream(tempFile);
        return new PointCloudFileStream(stream, fileNameOf(entryPath), formatOf(extensionOf(entryPath)), total);
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

    private PointCloudDataset getPointCloudDataset(String datasetVersionId) {
        if (datasetVersionId == null || datasetVersionId.isBlank()) {
            throw new IllegalArgumentException("datasetVersionId 不能为空");
        }
        DatasetVersion version = datasetVersionRepo.findByIdAndDeletedFalse(datasetVersionId.trim())
                .orElseThrow(() -> previewNotFound("dataset version not found or no permission"));
        DatasetAsset asset = datasetAssetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(() -> previewNotFound("dataset version not found or no permission"));

        Integer ownerUserId = version.getOwnerUserId() != null ? version.getOwnerUserId() : asset.getOwnerUserId();
        requireOwnerAccess(ownerUserId);
        requirePreviewableStatus(version);

        if (!"POINT_CLOUD".equalsIgnoreCase(asset.getType())) {
            throw previewNotPreviewable("点云预览仅支持 POINT_CLOUD 数据集");
        }
        requireStoragePath(version);
        requireObjectAccess(version.getStoragePath(), ownerUserId);
        return new PointCloudDataset(version, asset);
    }

    private void requirePreviewableStatus(DatasetVersion version) {
        String status = version.getStatus();
        if (!"READY".equals(status) && !"DEPRECATED".equals(status)) {
            throw previewNotPreviewable(
                    "dataset version status must be READY or DEPRECATED for preview"
            );
        }
    }

    private PointCloudPreviewDto basePreview(DatasetVersion version, String sourceName) {
        PointCloudPreviewDto dto = new PointCloudPreviewDto();
        dto.setDatasetVersionId(version.getId());
        dto.setFileName(fileNameOf(sourceName));
        dto.setType("POINT_CLOUD");
        dto.setSizeBytes(version.getSizeBytes());
        dto.setPreviewSupported(false);
        dto.setPointCloudFiles(null);
        return dto;
    }

    private Long resolveObjectSize(DatasetVersion version) {
        if (version.getSizeBytes() != null) {
            return version.getSizeBytes();
        }
        try {
            return minioService.stat(version.getStoragePath()).size();
        } catch (Exception e) {
            return null;
        }
    }

    private void requireStoragePath(DatasetVersion version) {
        if (version.getStoragePath() == null || version.getStoragePath().isBlank()) {
            throw previewNotPreviewable("数据集版本缺少存储路径");
        }
    }

    private void requireOwnerAccess(Integer ownerUserId) {
        try {
            authContext.requireOwnerAccess(ownerUserId, "dataset version not found or no permission");
        } catch (IllegalArgumentException exception) {
            throw previewNotFound("dataset version not found or no permission", exception);
        }
    }

    private void requireObjectAccess(String storagePath, Integer ownerUserId) {
        try {
            authContext.requireObjectAccess(
                    storagePath,
                    ownerUserId,
                    "dataset version not found or no permission"
            );
        } catch (IllegalArgumentException exception) {
            throw previewNotFound("dataset version not found or no permission", exception);
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

    private boolean isPreviewAllowed(Long sizeBytes) {
        return sizeBytes != null && sizeBytes >= 0 && sizeBytes <= maxPreviewSize;
    }

    private String tooLargeMessage() {
        return "文件过大，请下载后本地查看";
    }

    private String singleFilePreviewUrl(
            String datasetVersionId,
            PreviewUrlMode previewUrlMode
    ) {
        if (previewUrlMode == PreviewUrlMode.V2) {
            return "/api/v2/dataset-versions/"
                    + queryEncode(datasetVersionId)
                    + "/point-cloud/file";
        }
        return "/api/dataset/point-cloud/file?id=" + queryEncode(datasetVersionId);
    }

    private String zipFilePreviewUrl(
            String datasetVersionId,
            String entryPath,
            PreviewUrlMode previewUrlMode
    ) {
        if (previewUrlMode == PreviewUrlMode.V2) {
            return "/api/v2/dataset-versions/"
                    + queryEncode(datasetVersionId)
                    + "/point-cloud/zip-file?path="
                    + queryEncode(entryPath);
        }
        return "/api/dataset/point-cloud/zip-file?id="
                + queryEncode(datasetVersionId)
                + "&path="
                + queryEncode(entryPath);
    }

    private enum PreviewUrlMode {
        V1,
        V2
    }

    private static final class ZipEntryInfoMethod {
        private static final int STORED = 0;
        private static final int DEFLATED = 8;

        private ZipEntryInfoMethod() {
        }
    }

    private String normalizeZipEntryPath(String path) {
        try {
            return ZipPathValidator.normalizeEntryPath(path);
        } catch (IllegalArgumentException exception) {
            if (path == null || path.isBlank()) {
                throw new IllegalArgumentException("zip entry path 不能为空", exception);
            }
            throw new IllegalArgumentException("zip entry path 非法: " + path, exception);
        }
    }

    private String sourceName(DatasetVersion version) {
        if (version.getFileName() != null && !version.getFileName().isBlank()) {
            return version.getFileName();
        }
        return version.getStoragePath();
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

    private String formatOf(String extension) {
        return ".pcd".equals(extension) ? "PCD" : "PLY";
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

    public record PointCloudFileStream(
            InputStream inputStream,
            String fileName,
            String format,
            Long sizeBytes
    ) {
    }

    private record PointCloudDataset(DatasetVersion version, DatasetAsset asset) {
    }
}
