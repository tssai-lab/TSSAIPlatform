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
import io.minio.ComposeObjectArgs;
import io.minio.ComposeSource;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ModelUploadService {

    private static final int CHUNK_SIZE = 5 * 1024 * 1024;
    private static final String STATUS_UPLOADING = "UPLOADING";
    private static final String STATUS_COMPLETED = "COMPLETED";

    private final MinioClient minioClient;
    private final String bucket;
    private final ModelUploadSessionRepository sessionRepo;
    private final ModelUploadChunkRepository chunkRepo;
    private final ModelAssetRepository modelAssetRepo;
    private final ModelVersionRepository modelVersionRepo;

    public ModelUploadService(
            MinioClient minioClient,
            MinioConfig minioConfig,
            ModelUploadSessionRepository sessionRepo,
            ModelUploadChunkRepository chunkRepo,
            ModelAssetRepository modelAssetRepo,
            ModelVersionRepository modelVersionRepo
    ) {
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
        this.sessionRepo = sessionRepo;
        this.chunkRepo = chunkRepo;
        this.modelAssetRepo = modelAssetRepo;
        this.modelVersionRepo = modelVersionRepo;
    }

    @Transactional
    public ModelUploadProgressDto init(UploadInitRequest req) {
        validateInit(req);
        String fingerprint = normalizeText(req.getFileFingerprint());
        if (fingerprint != null) {
            ModelUploadSession existing = sessionRepo
                    .findFirstByFileFingerprintAndStatusOrderByUpdatedAtDesc(fingerprint, STATUS_UPLOADING)
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

        String objectName = "models/_uploads/" + uploadId + "/part-" + partIndex;
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
        ModelUploadSession session = getSession(req.getUploadId());
        if (STATUS_COMPLETED.equals(session.getStatus())) {
            return completedPayload(session, req.getModelName(), req.getVersion(), taskType, req.getRemark());
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
        String destName = "models/" + sanitizeSegment(req.getModelName())
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
        } catch (Exception e) {
            throw new IllegalArgumentException("合并文件失败: " + e.getMessage());
        }

        Instant now = Instant.now();
        ModelAsset asset = new ModelAsset();
        asset.setId(assetId);
        asset.setName(req.getModelName().trim());
        asset.setType(taskType);
        asset.setRemark(req.getRemark().trim());
        asset.setCreatedAt(now);
        asset.setUpdatedAt(now);
        modelAssetRepo.save(asset);

        ModelVersion ver = new ModelVersion();
        ver.setId(versionId);
        ver.setAssetId(assetId);
        ver.setVersion(req.getVersion().trim());
        ver.setFileName(session.getFileName());
        ver.setStoragePath(destName);
        ver.setSizeBytes(session.getFileSize());
        ver.setCreatedAt(now);
        modelVersionRepo.save(ver);

        session.setStatus(STATUS_COMPLETED);
        session.setStoragePath(destName);
        session.setAssetId(assetId);
        session.setVersionId(versionId);
        session.setUpdatedAt(now);
        sessionRepo.save(session);
        cleanupChunks(session.getId(), chunks);

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
        return sessionRepo.findById(uploadId)
                .orElseThrow(() -> new IllegalArgumentException("uploadId 无效"));
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
        data.put("createdAt", session.getCreatedAt());
        data.put("updatedAt", session.getUpdatedAt());
        return data;
    }

    private void cleanupChunks(String uploadId, List<ModelUploadChunk> chunks) {
        List<String> objectNames = new ArrayList<>();
        for (ModelUploadChunk chunk : chunks) {
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
