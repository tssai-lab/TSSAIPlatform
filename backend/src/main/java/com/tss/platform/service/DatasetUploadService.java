package com.tss.platform.service;

import com.tss.platform.config.MinioConfig;
import com.tss.platform.dto.DatasetUploadCompleteRequest;
import com.tss.platform.dto.DatasetUploadInitRequest;
import com.tss.platform.dto.DatasetUploadProgressDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetUploadChunk;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.model.TaskType;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetUploadChunkRepository;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
import io.minio.ComposeObjectArgs;
import io.minio.ComposeSource;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import java.util.zip.ZipInputStream;

@Service
public class DatasetUploadService {

    private static final int CHUNK_SIZE = 5 * 1024 * 1024;
    private static final String STATUS_UPLOADING = "UPLOADING";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final Set<String> CV_IMAGE_EXTENSIONS = Set.of(
            ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff"
    );
    private static final Set<String> NLP_ALLOWED_EXTENSIONS = Set.of(
            ".txt", ".json", ".jsonl", ".csv", ".xlsx", ".xls", ".pdf", ".docx", ".xml"
    );
    private static final int MAX_DATASET_ZIP_ENTRIES = 100_000;
    private static final long MAX_DATASET_UNCOMPRESSED_BYTES = 50L * 1024 * 1024 * 1024;

    private final MinioClient minioClient;
    private final String bucket;
    private final DatasetUploadSessionRepository sessionRepo;
    private final DatasetUploadChunkRepository chunkRepo;
    private final DatasetAssetRepository assetRepo;
    private final DatasetVersionRepository versionRepo;
    private final AuthContext authContext;

    public DatasetUploadService(
            MinioClient minioClient,
            MinioConfig minioConfig,
            DatasetUploadSessionRepository sessionRepo,
            DatasetUploadChunkRepository chunkRepo,
            DatasetAssetRepository assetRepo,
            DatasetVersionRepository versionRepo,
            AuthContext authContext
    ) {
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
        this.sessionRepo = sessionRepo;
        this.chunkRepo = chunkRepo;
        this.assetRepo = assetRepo;
        this.versionRepo = versionRepo;
        this.authContext = authContext;
    }

    @Transactional
    public DatasetUploadProgressDto init(DatasetUploadInitRequest req) {
        validateInit(req);
        Integer ownerUserId = authContext.currentUserId();
        String taskType = TaskType.normalize(req.getType());
        validateDatasetFileName(taskType, req.getFileName());
        String fingerprint = normalizeText(req.getFileFingerprint());
        if (fingerprint != null) {
            DatasetUploadSession existing = sessionRepo
                    .findFirstByFileFingerprintAndStatusAndOwnerUserIdOrderByUpdatedAtDesc(
                            fingerprint,
                            STATUS_UPLOADING,
                            ownerUserId
                    )
                    .orElse(null);
            if (existing != null && sameUpload(existing, req, taskType)) {
                existing.setRemark(req.getRemark());
                existing.setUpdatedAt(Instant.now());
                return progress(sessionRepo.save(existing));
            }
        }

        DatasetUploadSession session = new DatasetUploadSession();
        session.setId("dataset-upload-" + System.currentTimeMillis() + "-"
                + UUID.randomUUID().toString().replace("-", ""));
        session.setFileFingerprint(fingerprint);
        session.setFileName(req.getFileName().trim());
        session.setFileSize(req.getFileSize());
        session.setChunkSize(CHUNK_SIZE);
        session.setTotalChunks((int) Math.ceil(req.getFileSize() / (double) CHUNK_SIZE));
        session.setDatasetName(req.getDatasetName().trim());
        session.setVersion(defaultVersion(req.getVersion()));
        session.setType(taskType);
        session.setRemark(req.getRemark());
        session.setStatus(STATUS_UPLOADING);
        session.setOwnerUserId(ownerUserId);
        Instant now = Instant.now();
        session.setCreatedAt(now);
        session.setUpdatedAt(now);
        return progress(sessionRepo.save(session));
    }

    @Transactional
    public DatasetUploadProgressDto saveChunk(String uploadId, Integer partIndex, MultipartFile file) {
        DatasetUploadSession session = getSession(uploadId);
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return progress(session);
        }
        if (partIndex == null || partIndex < 0 || partIndex >= session.getTotalChunks()) {
            throw new IllegalArgumentException("partIndex 超出范围");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("分片文件不能为空");
        }
        if (partIndex < session.getTotalChunks() - 1 && file.getSize() != session.getChunkSize()) {
            throw new IllegalArgumentException("非末尾分片大小必须等于 chunkSize");
        }

        String objectName = "users/" + session.getOwnerUserId() + "/datasets/_uploads/" + uploadId + "/part-" + partIndex;
        try (InputStream is = file.getInputStream()) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucket)
                            .object(objectName)
                            .stream(is, file.getSize(), -1)
                            .contentType(MediaType.APPLICATION_OCTET_STREAM_VALUE)
                            .build()
            );
            StatObjectResponse stat = minioClient.statObject(
                    StatObjectArgs.builder().bucket(bucket).object(objectName).build()
            );
            DatasetUploadChunk chunk = chunkRepo.findByUploadIdAndPartIndex(uploadId, partIndex)
                    .orElseGet(() -> {
                        DatasetUploadChunk c = new DatasetUploadChunk();
                        c.setId("dataset-chunk-" + UUID.randomUUID().toString().replace("-", ""));
                        c.setUploadId(uploadId);
                        c.setPartIndex(partIndex);
                        c.setCreatedAt(Instant.now());
                        return c;
                    });
            chunk.setObjectName(objectName);
            chunk.setSizeBytes(file.getSize());
            chunk.setEtag(stat.etag());
            chunkRepo.save(chunk);
            session.setUpdatedAt(Instant.now());
            return progress(sessionRepo.save(session));
        } catch (Exception e) {
            throw new IllegalArgumentException("分片上传失败: " + e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public DatasetUploadProgressDto getProgress(String uploadId) {
        return progress(getSession(uploadId));
    }

    @Transactional
    public Map<String, Object> complete(DatasetUploadCompleteRequest req) {
        if (req == null || req.getUploadId() == null || req.getUploadId().isBlank()) {
            throw new IllegalArgumentException("uploadId 不能为空");
        }
        DatasetUploadSession session = getSession(req.getUploadId());
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return completedPayload(session);
        }

        List<DatasetUploadChunk> chunks = chunkRepo.findByUploadIdOrderByPartIndexAsc(session.getId());
        if (chunks.size() != session.getTotalChunks()) {
            throw new IllegalArgumentException("分片未上传完成");
        }
        for (int i = 0; i < session.getTotalChunks(); i += 1) {
            if (!Integer.valueOf(i).equals(chunks.get(i).getPartIndex())) {
                throw new IllegalArgumentException("缺少分片: " + i);
            }
        }

        String assetId = "dataset-asset-" + UUID.randomUUID().toString().replace("-", "");
        String versionId = "dataset-ver-" + UUID.randomUUID().toString().replace("-", "");
        String destName = "users/" + session.getOwnerUserId()
                + "/datasets/" + assetId + "/" + sanitizeSegment(session.getVersion())
                + "/" + sanitizeSegment(session.getFileName());
        try {
            List<ComposeSource> sources = chunks.stream()
                    .map(chunk -> ComposeSource.builder()
                            .bucket(bucket)
                            .object(chunk.getObjectName())
                            .build())
                    .collect(Collectors.toList());
            minioClient.composeObject(
                    ComposeObjectArgs.builder()
                            .bucket(bucket)
                            .object(destName)
                            .sources(sources)
                            .build()
            );
            validateDatasetObjectFormat(session.getType(), session.getFileName(), destName);
        } catch (Exception e) {
            try {
                minioClient.removeObject(
                        RemoveObjectArgs.builder().bucket(bucket).object(destName).build()
                );
            } catch (Exception ignored) {
                // 合并后格式校验失败时尽力清理临时最终对象。
            }
            throw new IllegalArgumentException("合并文件失败: " + e.getMessage());
        }

        Instant now = Instant.now();
        DatasetAsset asset = new DatasetAsset();
        asset.setId(assetId);
        asset.setName(session.getDatasetName());
        asset.setType(session.getType());
        asset.setRemark(session.getRemark());
        asset.setOwnerUserId(session.getOwnerUserId());
        asset.setCreatedAt(now);
        asset.setUpdatedAt(now);
        assetRepo.save(asset);

        DatasetVersion version = new DatasetVersion();
        version.setId(versionId);
        version.setAssetId(assetId);
        version.setVersion(session.getVersion());
        version.setFileName(session.getFileName());
        version.setStoragePath(destName);
        version.setSizeBytes(session.getFileSize());
        version.setRemark(session.getRemark());
        version.setOwnerUserId(session.getOwnerUserId());
        version.setCreatedAt(now);
        versionRepo.save(version);

        session.setStatus(STATUS_COMPLETED);
        session.setStoragePath(destName);
        session.setAssetId(assetId);
        session.setVersionId(versionId);
        session.setUpdatedAt(now);
        sessionRepo.save(session);
        cleanupChunks(session.getId(), chunks);

        return completedPayload(session);
    }

    @Transactional
    public Map<String, Object> uploadCvFolder(
            String datasetName,
            String versionValue,
            String type,
            String remark,
            List<MultipartFile> files,
            List<String> paths
    ) {
        requireText(datasetName, "datasetName 不能为空");
        String taskType = TaskType.normalize(type);
        if (!"CV".equals(taskType)) {
            throw new IllegalArgumentException("图片文件夹上传仅支持 CV 数据集");
        }
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("图片文件夹不能为空");
        }
        if (paths == null || paths.size() != files.size()) {
            throw new IllegalArgumentException("paths 必须与 files 一一对应");
        }

        String version = defaultVersion(versionValue);
        Integer ownerUserId = authContext.currentUserId();
        String assetId = "dataset-asset-" + UUID.randomUUID().toString().replace("-", "");
        String versionId = "dataset-ver-" + UUID.randomUUID().toString().replace("-", "");
        String fileName = sanitizeSegment(datasetName) + "-" + sanitizeSegment(version) + "-folder.zip";
        String destName = "users/" + ownerUserId + "/datasets/" + assetId + "/" + sanitizeSegment(version) + "/" + fileName;
        Path tempZip = null;

        try {
            tempZip = Files.createTempFile("dataset-folder-", ".zip");
            int imageCount = writeCvFolderZip(tempZip, files, paths);
            if (imageCount <= 0) {
                throw new IllegalArgumentException("CV 图片文件夹必须包含图片文件");
            }
            long sizeBytes = Files.size(tempZip);
            try (InputStream is = Files.newInputStream(tempZip)) {
                minioClient.putObject(
                        PutObjectArgs.builder()
                                .bucket(bucket)
                                .object(destName)
                                .stream(is, sizeBytes, -1)
                                .contentType("application/zip")
                                .build()
                );
            }
            validateDatasetObjectFormat(taskType, fileName, destName);

            Instant now = Instant.now();
            DatasetAsset asset = new DatasetAsset();
            asset.setId(assetId);
            asset.setName(datasetName.trim());
            asset.setType(taskType);
            asset.setRemark(remark);
            asset.setOwnerUserId(ownerUserId);
            asset.setCreatedAt(now);
            asset.setUpdatedAt(now);
            assetRepo.save(asset);

            DatasetVersion versionEntity = new DatasetVersion();
            versionEntity.setId(versionId);
            versionEntity.setAssetId(assetId);
            versionEntity.setVersion(version);
            versionEntity.setFileName(fileName);
            versionEntity.setStoragePath(destName);
            versionEntity.setSizeBytes(sizeBytes);
            versionEntity.setRemark(remark);
            versionEntity.setOwnerUserId(ownerUserId);
            versionEntity.setCreatedAt(now);
            versionRepo.save(versionEntity);

            return completedPayload(
                    null,
                    assetId,
                    versionId,
                    datasetName.trim(),
                    version,
                    taskType,
                    remark,
                    fileName,
                    destName,
                    sizeBytes,
                    now,
                    now
            );
        } catch (IllegalArgumentException e) {
            removeObjectQuietly(destName);
            throw e;
        } catch (Exception e) {
            removeObjectQuietly(destName);
            throw new IllegalArgumentException("图片文件夹上传失败: " + e.getMessage());
        } finally {
            if (tempZip != null) {
                try {
                    Files.deleteIfExists(tempZip);
                } catch (Exception ignored) {
                    // 临时 zip 清理失败不影响上传结果。
                }
            }
        }
    }

    private void validateInit(DatasetUploadInitRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        requireText(req.getFileName(), "fileName 不能为空");
        if (req.getFileSize() == null || req.getFileSize() <= 0) {
            throw new IllegalArgumentException("fileSize 必须大于 0");
        }
        requireText(req.getDatasetName(), "datasetName 不能为空");
        String taskType = TaskType.normalize(req.getType());
        validateDatasetFileName(taskType, req.getFileName());
    }

    private DatasetUploadSession getSession(String uploadId) {
        if (uploadId == null || uploadId.isBlank()) {
            throw new IllegalArgumentException("uploadId 不能为空");
        }
        DatasetUploadSession session = sessionRepo.findById(uploadId)
                .orElseThrow(() -> new IllegalArgumentException("uploadId 无效"));
        authContext.requireOwnerAccess(session.getOwnerUserId(), "uploadId invalid or not accessible");
        return session;
    }

    private DatasetUploadProgressDto progress(DatasetUploadSession session) {
        List<DatasetUploadChunk> chunks = chunkRepo.findByUploadIdOrderByPartIndexAsc(session.getId());
        boolean completed = STATUS_COMPLETED.equals(session.getStatus());
        DatasetUploadProgressDto dto = new DatasetUploadProgressDto();
        dto.setUploadId(session.getId());
        dto.setStatus(session.getStatus());
        dto.setFileName(session.getFileName());
        dto.setFileSize(session.getFileSize());
        dto.setChunkSize(session.getChunkSize());
        dto.setTotalChunks(session.getTotalChunks());
        dto.setUploadedChunks(completed ? session.getTotalChunks() : chunks.size());
        dto.setUploadedBytes(completed
                ? session.getFileSize()
                : chunks.stream().mapToLong(c -> c.getSizeBytes() == null ? 0L : c.getSizeBytes()).sum());
        dto.setUploadedPartIndexes(completed
                ? completedPartIndexes(session.getTotalChunks())
                : chunks.stream().map(DatasetUploadChunk::getPartIndex).collect(Collectors.toList()));
        dto.setStoragePath(session.getStoragePath());
        dto.setAssetId(session.getAssetId());
        dto.setVersionId(session.getVersionId());
        dto.setCreatedAt(session.getCreatedAt());
        dto.setUpdatedAt(session.getUpdatedAt());
        return dto;
    }

    private List<Integer> completedPartIndexes(Integer totalChunks) {
        List<Integer> indexes = new ArrayList<>();
        for (int i = 0; i < totalChunks; i += 1) {
            indexes.add(i);
        }
        return indexes;
    }

    private Map<String, Object> completedPayload(DatasetUploadSession session) {
        Map<String, Object> data = new HashMap<>();
        data.put("uploadId", session.getId());
        data.put("id", session.getVersionId());
        data.put("assetId", session.getAssetId());
        data.put("name", session.getDatasetName());
        data.put("version", session.getVersion());
        data.put("type", session.getType());
        data.put("remark", session.getRemark());
        data.put("fileName", session.getFileName());
        data.put("storagePath", session.getStoragePath());
        data.put("sizeBytes", session.getFileSize());
        data.put("status", session.getStatus());
        data.put("ownerUserId", session.getOwnerUserId());
        data.put("createdAt", session.getCreatedAt());
        data.put("updatedAt", session.getUpdatedAt());
        return data;
    }

    private Map<String, Object> completedPayload(
            String uploadId,
            String assetId,
            String versionId,
            String datasetName,
            String version,
            String type,
            String remark,
            String fileName,
            String storagePath,
            Long sizeBytes,
            Instant createdAt,
            Instant updatedAt
    ) {
        Map<String, Object> data = new HashMap<>();
        data.put("uploadId", uploadId);
        data.put("id", versionId);
        data.put("assetId", assetId);
        data.put("name", datasetName);
        data.put("version", version);
        data.put("type", type);
        data.put("remark", remark);
        data.put("fileName", fileName);
        data.put("storagePath", storagePath);
        data.put("sizeBytes", sizeBytes);
        data.put("status", STATUS_COMPLETED);
        data.put("ownerUserId", authContext.currentUserId());
        data.put("createdAt", createdAt);
        data.put("updatedAt", updatedAt);
        return data;
    }

    private int writeCvFolderZip(Path tempZip, List<MultipartFile> files, List<String> paths) throws Exception {
        int imageCount = 0;
        Set<String> entryNames = new LinkedHashSet<>();
        try (OutputStream os = Files.newOutputStream(tempZip);
             ZipOutputStream zip = new ZipOutputStream(os)) {
            for (int i = 0; i < files.size(); i += 1) {
                MultipartFile file = files.get(i);
                if (file == null || file.isEmpty()) {
                    throw new IllegalArgumentException("图片文件不能为空");
                }
                String entryName = sanitizeZipEntryPath(paths.get(i), file.getOriginalFilename());
                if (!CV_IMAGE_EXTENSIONS.contains(extensionOf(entryName))) {
                    throw new IllegalArgumentException("CV 图片文件夹中仅允许图片文件: " + entryName);
                }
                if (!entryNames.add(entryName)) {
                    throw new IllegalArgumentException("图片文件夹中存在重复路径: " + entryName);
                }

                ZipEntry entry = new ZipEntry(entryName);
                entry.setTime(System.currentTimeMillis());
                zip.putNextEntry(entry);
                try (InputStream input = file.getInputStream()) {
                    input.transferTo(zip);
                }
                zip.closeEntry();
                imageCount += 1;
            }
        }
        return imageCount;
    }

    private String sanitizeZipEntryPath(String rawPath, String fallbackName) {
        String path = normalizeText(rawPath);
        if (path == null) {
            path = normalizeText(fallbackName);
        }
        if (path == null) {
            throw new IllegalArgumentException("图片文件路径不能为空");
        }
        String normalized = path.replace('\\', '/');
        if (normalized.startsWith("/") || normalized.matches("^[A-Za-z]:.*")) {
            throw new IllegalArgumentException("图片文件路径非法: " + path);
        }
        List<String> parts = new ArrayList<>();
        for (String part : normalized.split("/")) {
            if (part == null || part.isBlank() || ".".equals(part)) {
                continue;
            }
            if ("..".equals(part) || part.contains("\u0000")) {
                throw new IllegalArgumentException("图片文件路径非法: " + path);
            }
            parts.add(sanitizeZipSegment(part));
        }
        if (parts.isEmpty()) {
            throw new IllegalArgumentException("图片文件路径不能为空");
        }
        return String.join("/", parts);
    }

    private String sanitizeZipSegment(String value) {
        String segment = value.trim().replaceAll("[\\\\:*?\"<>|]", "_");
        return segment.isEmpty() ? "unnamed" : segment;
    }

    private void removeObjectQuietly(String objectName) {
        if (objectName == null || objectName.isBlank()) {
            return;
        }
        try {
            minioClient.removeObject(
                    RemoveObjectArgs.builder().bucket(bucket).object(objectName).build()
            );
        } catch (Exception ignored) {
            // 清理失败时保留原始错误。
        }
    }

    private void cleanupChunks(String uploadId, List<DatasetUploadChunk> chunks) {
        List<String> objectNames = new ArrayList<>();
        for (DatasetUploadChunk chunk : chunks) {
            objectNames.add(chunk.getObjectName());
        }
        for (String objectName : objectNames) {
            try {
                minioClient.removeObject(
                        RemoveObjectArgs.builder()
                                .bucket(bucket)
                                .object(objectName)
                                .build()
                );
            } catch (Exception ignored) {
                // 临时分片清理失败不阻断完成结果，后续可用定时任务兜底清理。
            }
        }
        chunkRepo.deleteByUploadId(uploadId);
    }

    private boolean sameUpload(DatasetUploadSession session, DatasetUploadInitRequest req, String taskType) {
        return session.getFileName().equals(req.getFileName().trim())
                && session.getFileSize().equals(req.getFileSize())
                && session.getDatasetName().equals(req.getDatasetName().trim())
                && session.getVersion().equals(defaultVersion(req.getVersion()))
                && session.getType().equals(taskType);
    }

    private String defaultVersion(String value) {
        return value == null || value.isBlank() ? "v1" : value.trim();
    }

    private String normalizeText(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void requireText(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
    }

    private void validateDatasetFileName(String taskType, String fileName) {
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
        }
    }

    private void validateDatasetObjectFormat(String taskType, String fileName, String objectName) throws Exception {
        String lower = fileName == null ? "" : fileName.trim().toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".zip")) {
            return;
        }
        boolean found = false;
        int entries = 0;
        long totalUncompressedBytes = 0;
        try (InputStream is = minioClient.getObject(
                GetObjectArgs.builder().bucket(bucket).object(objectName).build()
        );
             ZipInputStream zip = new ZipInputStream(new BufferedInputStream(is))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries += 1;
                if (entries > MAX_DATASET_ZIP_ENTRIES) {
                    throw new IllegalArgumentException("数据集 zip 文件条目过多");
                }
                String entryName = normalizeZipEntryName(entry.getName());
                if (!isSafeZipEntryPath(entryName)) {
                    throw new IllegalArgumentException("数据集 zip 包含非法路径: " + entry.getName());
                }
                if (!entry.isDirectory()) {
                    String ext = extensionOf(entryName);
                    if ("CV".equals(taskType)) {
                        if (!CV_IMAGE_EXTENSIONS.contains(ext)) {
                            throw new IllegalArgumentException("CV zip 数据集仅允许图片文件: " + entryName);
                        }
                        found = true;
                    }
                    if ("NLP".equals(taskType)) {
                        if (!NLP_ALLOWED_EXTENSIONS.contains(ext)) {
                            throw new IllegalArgumentException(
                                    "NLP zip dataset only allows .txt, .json, .jsonl, .csv, .xlsx, .xls, .pdf, .docx, or .xml files: "
                                            + entryName
                            );
                        }
                        found = true;
                    }
                    totalUncompressedBytes = drainZipEntry(zip, totalUncompressedBytes);
                }
                zip.closeEntry();
            }
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
        }
    }

    private long drainZipEntry(ZipInputStream zip, long currentTotal) throws Exception {
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

    private String normalizeZipEntryName(String name) {
        return name == null ? "" : name.replace('\\', '/');
    }

    private boolean isSafeZipEntryPath(String path) {
        if (path == null || path.isBlank() || path.startsWith("/") || path.matches("^[A-Za-z]:.*")) {
            return false;
        }
        for (String part : path.split("/")) {
            if ("..".equals(part) || part.contains("\u0000")) {
                return false;
            }
        }
        return true;
    }

    private String extensionOf(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        int index = lower.lastIndexOf('.');
        return index >= 0 ? lower.substring(index) : "";
    }

    private String sanitizeSegment(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            return "unnamed";
        }
        return normalized
                .replaceAll("[\\\\/:*?\"<>|]", "_")
                .toLowerCase(Locale.ROOT);
    }
}
