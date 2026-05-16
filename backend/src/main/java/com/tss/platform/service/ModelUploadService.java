package com.tss.platform.service;

import com.tss.platform.config.MinioConfig;
import com.tss.platform.dto.ModelUploadProgressDto;
import com.tss.platform.dto.UploadCompleteRequest;
import com.tss.platform.dto.UploadInitRequest;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelUploadChunk;
import com.tss.platform.entity.ModelUploadSession;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.model.TaskType;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelUploadChunkRepository;
import com.tss.platform.repository.ModelUploadSessionRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.security.AuthContext;
import io.minio.ComposeObjectArgs;
import io.minio.ComposeSource;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
public class ModelUploadService {

    private static final int CHUNK_SIZE = 5 * 1024 * 1024;
    private static final String STATUS_UPLOADING = "UPLOADING";
    private static final String STATUS_COMPLETING = "COMPLETING";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final int MAX_MODEL_ZIP_ENTRIES = 100_000;
    private static final long MAX_MODEL_UNCOMPRESSED_BYTES = 50L * 1024 * 1024 * 1024;

    private final MinioClient minioClient;
    private final String bucket;
    private final ModelUploadSessionRepository sessionRepo;
    private final ModelUploadChunkRepository chunkRepo;
    private final ModelAssetRepository modelAssetRepo;
    private final ModelVersionRepository modelVersionRepo;
    private final AuthContext authContext;
    private final MinioDeleteTaskService minioDeleteTaskService;

    public ModelUploadService(
            MinioClient minioClient,
            MinioConfig minioConfig,
            ModelUploadSessionRepository sessionRepo,
            ModelUploadChunkRepository chunkRepo,
            ModelAssetRepository modelAssetRepo,
            ModelVersionRepository modelVersionRepo,
            AuthContext authContext,
            MinioDeleteTaskService minioDeleteTaskService
    ) {
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
        this.sessionRepo = sessionRepo;
        this.chunkRepo = chunkRepo;
        this.modelAssetRepo = modelAssetRepo;
        this.modelVersionRepo = modelVersionRepo;
        this.authContext = authContext;
        this.minioDeleteTaskService = minioDeleteTaskService;
    }

    @Transactional
    public ModelUploadProgressDto init(UploadInitRequest req) {
        validateInit(req);
        Integer ownerUserId = authContext.currentUserId();
        String fingerprint = normalizeText(req.getFileFingerprint());
        if (fingerprint != null) {
            ModelUploadSession existing = sessionRepo
                    .findFirstByFileFingerprintAndStatusAndOwnerUserIdOrderByUpdatedAtDesc(
                            fingerprint,
                            STATUS_UPLOADING,
                            ownerUserId
                    )
                    .orElse(null);
            if (existing != null && sameUpload(existing, req)) {
                existing.setUpdatedAt(Instant.now());
                return progress(sessionRepo.save(existing));
            }
        }

        ModelUploadSession session = new ModelUploadSession();
        session.setId("model-upload-" + System.currentTimeMillis() + "-"
                + UUID.randomUUID().toString().replace("-", ""));
        session.setFileFingerprint(fingerprint);
        session.setFileName(req.getFileName().trim());
        session.setFileSize(req.getFileSize());
        session.setChunkSize(CHUNK_SIZE);
        session.setTotalChunks((int) Math.ceil(req.getFileSize() / (double) CHUNK_SIZE));
        session.setStatus(STATUS_UPLOADING);
        session.setOwnerUserId(ownerUserId);
        Instant now = Instant.now();
        session.setCreatedAt(now);
        session.setUpdatedAt(now);
        return progress(sessionRepo.save(session));
    }

    @Transactional
    public ModelUploadProgressDto saveChunk(String uploadId, Integer partIndex, MultipartFile file) {
        ModelUploadSession session = getSession(uploadId);
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

        String objectName = "users/" + session.getOwnerUserId() + "/models/_uploads/" + uploadId + "/part-" + partIndex;
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
            ModelUploadChunk chunk = chunkRepo.findByUploadIdAndPartIndex(uploadId, partIndex)
                    .orElseGet(() -> {
                        ModelUploadChunk c = new ModelUploadChunk();
                        c.setId("model-chunk-" + UUID.randomUUID().toString().replace("-", ""));
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
    public ModelUploadProgressDto getProgress(String uploadId) {
        return progress(getSession(uploadId));
    }

    @Transactional
    public Map<String, Object> complete(UploadCompleteRequest req) {
        String taskType = validateComplete(req);
        ModelUploadSession session = claimCompleting(req.getUploadId());
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return completedPayload(session);
        }

        List<ModelUploadChunk> chunks = chunkRepo.findByUploadIdOrderByPartIndexAsc(session.getId());
        if (chunks.size() != session.getTotalChunks()) {
            throw new IllegalArgumentException("分片未上传完成");
        }
        for (int i = 0; i < session.getTotalChunks(); i += 1) {
            if (!Integer.valueOf(i).equals(chunks.get(i).getPartIndex())) {
                throw new IllegalArgumentException("缺少分片: " + i);
            }
        }

        String assetId = "model-asset-" + UUID.randomUUID().toString().replace("-", "");
        String versionId = "model-ver-" + UUID.randomUUID().toString().replace("-", "");
        String destName = "users/" + session.getOwnerUserId()
                + "/models/" + assetId
                + "/" + sanitizeSegment(req.getVersion())
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
            validateModelObjectFormat(destName);
        } catch (Exception e) {
            removeObjectQuietly(destName);
            throw new IllegalArgumentException("合并文件失败: " + e.getMessage());
        }

        ModelAsset asset;
        ModelVersion ver;
        try {
            Instant now = Instant.now();
            asset = new ModelAsset();
            asset.setId(assetId);
            asset.setName(req.getModelName().trim());
            asset.setType(taskType);
            asset.setRemark(req.getRemark().trim());
            asset.setOwnerUserId(session.getOwnerUserId());
            asset.setCreatedAt(now);
            asset.setUpdatedAt(now);
            modelAssetRepo.saveAndFlush(asset);

            ver = new ModelVersion();
            ver.setId(versionId);
            ver.setAssetId(assetId);
            ver.setVersion(req.getVersion().trim());
            ver.setFileName(session.getFileName());
            ver.setStoragePath(destName);
            ver.setSizeBytes(session.getFileSize());
            ver.setOwnerUserId(session.getOwnerUserId());
            ver.setCreatedAt(now);
            modelVersionRepo.saveAndFlush(ver);

            session.setStatus(STATUS_COMPLETED);
            session.setStoragePath(destName);
            session.setAssetId(assetId);
            session.setVersionId(versionId);
            session.setUpdatedAt(now);
            sessionRepo.saveAndFlush(session);
        } catch (RuntimeException e) {
            removeObjectQuietly(destName);
            throw new IllegalArgumentException("保存模型上传记录失败: " + rootMessage(e));
        }
        registerChunkCleanup(session.getId(), chunks);

        return completedPayload(session, asset.getName(), ver.getVersion(), asset.getType(), asset.getRemark());
    }

    private String validateComplete(UploadCompleteRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        requireText(req.getUploadId(), "uploadId 不能为空");
        requireText(req.getModelName(), "modelName 不能为空");
        requireText(req.getVersion(), "version 不能为空");
        requireText(req.getRemark(), "remark 不能为空");
        return TaskType.normalize(req.getType());
    }

    private void validateInit(UploadInitRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        requireText(req.getFileName(), "fileName 不能为空");
        validateModelFileName(req.getFileName());
        if (req.getFileSize() == null || req.getFileSize() <= 0) {
            throw new IllegalArgumentException("fileSize 必须大于 0");
        }
    }

    private ModelUploadSession getSession(String uploadId) {
        if (uploadId == null || uploadId.isBlank()) {
            throw new IllegalArgumentException("uploadId 不能为空");
        }
        ModelUploadSession session = sessionRepo.findById(uploadId)
                .orElseThrow(() -> new IllegalArgumentException("uploadId 无效"));
        authContext.requireOwnerAccess(session.getOwnerUserId(), "uploadId invalid or not accessible");
        return session;
    }

    private ModelUploadSession claimCompleting(String uploadId) {
        ModelUploadSession session = getSession(uploadId);
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return session;
        }
        if (STATUS_COMPLETING.equals(session.getStatus())) {
            throw new IllegalArgumentException("模型文件正在合并中，请稍后查询进度");
        }
        if (!STATUS_UPLOADING.equals(session.getStatus())) {
            throw new IllegalArgumentException("上传状态不允许完成: " + session.getStatus());
        }

        Instant now = Instant.now();
        int updated = sessionRepo.updateStatusIfCurrent(
                session.getId(),
                session.getOwnerUserId(),
                STATUS_UPLOADING,
                STATUS_COMPLETING,
                now
        );
        if (updated == 0) {
            ModelUploadSession current = getSession(uploadId);
            if (STATUS_COMPLETED.equals(current.getStatus())) {
                return current;
            }
            throw new IllegalArgumentException("模型文件正在合并中，请稍后查询进度");
        }
        session.setStatus(STATUS_COMPLETING);
        session.setUpdatedAt(now);
        return session;
    }

    private ModelUploadProgressDto progress(ModelUploadSession session) {
        List<ModelUploadChunk> chunks = chunkRepo.findByUploadIdOrderByPartIndexAsc(session.getId());
        boolean completed = STATUS_COMPLETED.equals(session.getStatus());
        ModelUploadProgressDto dto = new ModelUploadProgressDto();
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
                : chunks.stream().map(ModelUploadChunk::getPartIndex).collect(Collectors.toList()));
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

    private Map<String, Object> completedPayload(
            ModelUploadSession session,
            String modelName,
            String version,
            String type,
            String remark
    ) {
        Map<String, Object> data = new HashMap<>();
        data.put("uploadId", session.getId());
        data.put("id", session.getVersionId());
        data.put("assetId", session.getAssetId());
        data.put("name", modelName);
        data.put("version", version);
        data.put("type", type);
        data.put("remark", remark);
        data.put("fileName", session.getFileName());
        data.put("storagePath", session.getStoragePath());
        data.put("sizeBytes", session.getFileSize());
        data.put("status", session.getStatus());
        data.put("ownerUserId", session.getOwnerUserId());
        data.put("createdAt", session.getCreatedAt());
        data.put("updatedAt", session.getUpdatedAt());
        return data;
    }

    private Map<String, Object> completedPayload(ModelUploadSession session) {
        ModelVersion version = session.getVersionId() == null
                ? null
                : modelVersionRepo.findById(session.getVersionId()).orElse(null);
        ModelAsset asset = version == null || version.getAssetId() == null
                ? null
                : modelAssetRepo.findById(version.getAssetId()).orElse(null);

        return completedPayload(
                session,
                asset != null ? asset.getName() : null,
                version != null ? version.getVersion() : null,
                asset != null ? asset.getType() : null,
                asset != null ? asset.getRemark() : null
        );
    }

    private void registerChunkCleanup(String uploadId, List<ModelUploadChunk> chunks) {
        List<String> objectNames = new ArrayList<>();
        for (ModelUploadChunk chunk : chunks) {
            objectNames.add(chunk.getObjectName());
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cleanupChunks(uploadId, objectNames);
                }
            });
            return;
        }
        cleanupChunks(uploadId, objectNames);
    }

    private void cleanupChunks(String uploadId, List<String> objectNames) {
        for (String objectName : objectNames) {
            try {
                minioDeleteTaskService.enqueueDefaultBucketDeleteImmediately(
                        objectName,
                        MinioDeleteTaskService.SOURCE_MODEL_UPLOAD_CHUNK,
                        uploadId,
                        null
                );
            } catch (Exception ignored) {
                // 临时分片删除任务入队失败不阻断完成结果。
            }
        }
        try {
            chunkRepo.deleteByUploadId(uploadId);
        } catch (Exception ignored) {
            // 临时分片元数据清理失败不影响已完成的上传记录。
        }
    }

    private boolean sameUpload(ModelUploadSession session, UploadInitRequest req) {
        return session.getFileName().equals(req.getFileName().trim())
                && session.getFileSize().equals(req.getFileSize());
    }

    private String normalizeText(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void requireText(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
    }

    private void validateModelFileName(String fileName) {
        String lower = fileName == null ? "" : fileName.trim().toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".zip")) {
            throw new IllegalArgumentException("模型文件仅支持 zip 压缩包");
        }
    }

    private void validateModelObjectFormat(String objectName) throws Exception {
        int entries = 0;
        boolean foundFile = false;
        long totalUncompressedBytes = 0;
        try (InputStream is = minioClient.getObject(
                GetObjectArgs.builder().bucket(bucket).object(objectName).build()
        );
             ZipInputStream zip = new ZipInputStream(new BufferedInputStream(is))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries += 1;
                if (entries > MAX_MODEL_ZIP_ENTRIES) {
                    throw new IllegalArgumentException("模型 zip 文件条目过多");
                }
                String entryName = normalizeZipEntryName(entry.getName());
                if (!isSafeZipEntryPath(entryName)) {
                    throw new IllegalArgumentException("模型 zip 包含非法路径: " + entry.getName());
                }
                if (!entry.isDirectory()) {
                    foundFile = true;
                    totalUncompressedBytes = drainZipEntry(zip, totalUncompressedBytes, MAX_MODEL_UNCOMPRESSED_BYTES);
                }
                zip.closeEntry();
            }
        }
        if (!foundFile) {
            throw new IllegalArgumentException("模型 zip 不能为空");
        }
    }

    private long drainZipEntry(ZipInputStream zip, long currentTotal, long maxTotal) throws Exception {
        byte[] buffer = new byte[8192];
        long total = currentTotal;
        int len;
        while ((len = zip.read(buffer)) != -1) {
            total += len;
            if (total > maxTotal) {
                throw new IllegalArgumentException("zip 解压后体积过大");
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

    private void removeObjectQuietly(String objectName) {
        if (objectName == null || objectName.isBlank()) {
            return;
        }
        try {
            minioDeleteTaskService.enqueueDefaultBucketDeleteImmediately(
                    objectName,
                    MinioDeleteTaskService.SOURCE_MODEL_UPLOAD_ROLLBACK,
                    objectName,
                    null
            );
        } catch (Exception ignored) {
            // 保留原始错误。
        }
    }

    private String rootMessage(Throwable e) {
        Throwable current = e;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        return current.getMessage() == null ? e.getMessage() : current.getMessage();
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
