package com.tss.platform.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.controller.v2.V2BusinessException;
import com.tss.platform.dto.DatasetPackageAppendInitRequest;
import com.tss.platform.dto.DatasetUploadCompleteRequest;
import com.tss.platform.dto.DatasetUploadInitRequest;
import com.tss.platform.dto.DatasetUploadProgressDto;
import com.tss.platform.dto.v2.V2DatasetUploadDto;
import com.tss.platform.dto.v2.V2UserError;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.ImportJob;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.ImportJobRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class V2DatasetUploadService {

    private static final String APPEND_PACKAGE = "APPEND_PACKAGE";

    private final DatasetUploadService uploadService;
    private final DatasetUploadSessionRepository sessionRepo;
    private final ImportJobRepository importJobRepo;
    private final ObjectMapper objectMapper;

    public V2DatasetUploadService(
            DatasetUploadService uploadService,
            DatasetUploadSessionRepository sessionRepo,
            ImportJobRepository importJobRepo,
            ObjectMapper objectMapper
    ) {
        this.uploadService = uploadService;
        this.sessionRepo = sessionRepo;
        this.importJobRepo = importJobRepo;
        this.objectMapper = objectMapper;
    }

    public V2DatasetUploadDto init(DatasetUploadInitRequest request) {
        try {
            return describe(uploadService.init(request));
        } catch (IllegalArgumentException exception) {
            throw new V2BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "INVALID_UPLOAD_REQUEST",
                    "上传请求无效，请检查 ZIP 文件和数据集信息"
            );
        }
    }

    public V2DatasetUploadDto initAppend(
            String editSessionId,
            DatasetPackageAppendInitRequest request
    ) {
        try {
            return describe(uploadService.initAppendPackage(editSessionId, request));
        } catch (IllegalArgumentException exception) {
            throw new V2BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "INVALID_UPLOAD_REQUEST",
                    "上传请求无效，请检查 ZIP 文件和上传参数"
            );
        }
    }

    public V2DatasetUploadDto saveChunk(
            String uploadId,
            Integer partIndex,
            MultipartFile file
    ) {
        try {
            return describe(uploadService.saveChunk(uploadId, partIndex, file));
        } catch (IllegalArgumentException exception) {
            throw new V2BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "UPLOAD_CHUNK_FAILED",
                    "文件分片上传失败，请重试"
            );
        }
    }

    public V2DatasetUploadDto get(String uploadId) {
        try {
            return describe(uploadService.getProgress(uploadId));
        } catch (IllegalArgumentException exception) {
            throw notFound();
        }
    }

    public V2DatasetUploadDto complete(String uploadId) {
        DatasetUploadProgressDto progress;
        try {
            progress = uploadService.getProgress(uploadId);
        } catch (IllegalArgumentException exception) {
            throw notFound();
        }
        DatasetUploadSession session = requireSession(progress.getUploadId());
        DatasetUploadCompleteRequest request = new DatasetUploadCompleteRequest();
        request.setUploadId(uploadId);
        try {
            if (APPEND_PACKAGE.equals(session.getUploadPurpose())) {
                if (session.getVersionId() == null || session.getVersionId().isBlank()) {
                    throw new IllegalArgumentException("append version is missing");
                }
                uploadService.completeAppendPackage(session.getVersionId(), request);
            } else {
                uploadService.complete(request);
            }
            return describe(uploadService.getProgress(uploadId));
        } catch (IllegalArgumentException exception) {
            throw new V2BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "DATASET_UPLOAD_NOT_COMPLETABLE",
                    "上传尚未完成或文件校验失败，请检查后重试"
            );
        }
    }

    private V2DatasetUploadDto describe(DatasetUploadProgressDto source) {
        DatasetUploadSession session = requireSession(source.getUploadId());
        ImportJob job = session.getImportJobId() == null
                ? null
                : importJobRepo.findById(session.getImportJobId()).orElse(null);

        V2DatasetUploadDto dto = new V2DatasetUploadDto();
        dto.setUploadId(source.getUploadId());
        dto.setStatus(source.getStatus());
        dto.setFileName(source.getFileName());
        dto.setFileSize(source.getFileSize());
        dto.setChunkSize(source.getChunkSize());
        dto.setTotalChunks(source.getTotalChunks());
        dto.setUploadedChunks(source.getUploadedChunks());
        dto.setUploadedBytes(source.getUploadedBytes());
        dto.setUploadedPartIndexes(source.getUploadedPartIndexes());
        dto.setDatasetId(source.getAssetId());
        dto.setEditSessionId(
                APPEND_PACKAGE.equals(session.getUploadPurpose())
                        ? session.getVersionId()
                        : null
        );
        dto.setVersionLabel(source.getVersionLabel());
        dto.setDisplayStatus(displayStatus(source.getStatus(), job));
        dto.setImportProgress(job == null ? null : job.getProgress());
        dto.setUserError(userError(job));
        dto.setCreatedAt(source.getCreatedAt());
        dto.setUpdatedAt(source.getUpdatedAt());
        return dto;
    }

    private DatasetUploadSession requireSession(String uploadId) {
        return sessionRepo.findById(uploadId).orElseThrow(this::notFound);
    }

    private String displayStatus(String uploadStatus, ImportJob job) {
        if (job != null && "FAILED".equals(job.getStatus())) {
            return "IMPORT_FAILED";
        }
        if (job != null
                && ("PENDING".equals(job.getStatus())
                || "RUNNING".equals(job.getStatus()))) {
            return "IMPORTING";
        }
        if (job != null && "SUCCESS".equals(job.getStatus())) {
            return "READY";
        }
        if ("COMPLETING".equals(uploadStatus)) {
            return "PROCESSING";
        }
        if ("COMPLETED".equals(uploadStatus)) {
            return "READY";
        }
        return "UPLOADING";
    }

    private V2UserError userError(ImportJob job) {
        if (job == null || !"FAILED".equals(job.getStatus())) {
            return null;
        }
        return new V2UserError(
                job.getErrorCode() == null ? "IMPORT_FAILED" : job.getErrorCode(),
                job.getErrorMessage() == null
                        ? "数据导入失败，请检查上传内容后重试"
                        : job.getErrorMessage(),
                parseDetails(job.getErrorDetailsJson())
        );
    }

    private Map<String, Object> parseDetails(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return Map.copyOf(objectMapper.readValue(
                    json,
                    new TypeReference<LinkedHashMap<String, Object>>() {
                    }
            ));
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private V2BusinessException notFound() {
        return new V2BusinessException(
                HttpStatus.NOT_FOUND,
                "DATASET_UPLOAD_NOT_FOUND",
                "数据集上传任务不存在或无权访问"
        );
    }
}
