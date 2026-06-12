package com.tss.platform.service;

import com.tss.platform.entity.DatasetAnnotation;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetSample;
import com.tss.platform.entity.DatasetSampleData;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.repository.DatasetAnnotationRepository;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleDataRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.Set;
import java.util.zip.Inflater;
import java.util.zip.InflaterInputStream;

@Service
public class SampleFileService {

    private static final long MAX_PREVIEW_BYTES = 100L * 1024 * 1024;
    private static final String DATA_NOT_FOUND = "sample file not found or no permission";
    private static final String ANNOTATION_NOT_FOUND =
            "annotation file not found or no permission";
    private static final Set<String> SAFE_OTHER_CONTENT_TYPES = Set.of(
            "text/plain",
            "text/csv",
            "application/json",
            "application/xml",
            "text/xml"
    );

    private final DatasetSampleDataRepository dataRepo;
    private final DatasetSampleRepository sampleRepo;
    private final DatasetAnnotationRepository annotationRepo;
    private final DatasetVersionRepository versionRepo;
    private final DatasetAssetRepository assetRepo;
    private final MinioService minioService;
    private final AuthContext authContext;

    public SampleFileService(
            DatasetSampleDataRepository dataRepo,
            DatasetSampleRepository sampleRepo,
            DatasetAnnotationRepository annotationRepo,
            DatasetVersionRepository versionRepo,
            DatasetAssetRepository assetRepo,
            MinioService minioService,
            AuthContext authContext
    ) {
        this.dataRepo = dataRepo;
        this.sampleRepo = sampleRepo;
        this.annotationRepo = annotationRepo;
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.minioService = minioService;
        this.authContext = authContext;
    }

    @Transactional(readOnly = true)
    public SampleFileStream openDataPreview(String dataId) {
        return openDataPreview(dataId, null);
    }

    @Transactional(readOnly = true)
    public SampleFileStream openDataPreview(String dataId, String rangeHeader) {
        DatasetSampleData data = requireData(dataId);
        DatasetVersion version = requireReadyVersionForData(data);
        if (isVideo(data)) {
            return openStoredVideoPreview(version, data, rangeHeader);
        }
        validatePreviewType(data);
        Long sizeBytes = effectiveSize(data.getUncompressedSize(), data.getSizeBytes());
        if (sizeBytes == null) {
            throw new SampleFileException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "ZIP entry size is unavailable"
            );
        }
        if (sizeBytes > MAX_PREVIEW_BYTES) {
            throw new SampleFileException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "preview file exceeds 100MB limit"
            );
        }
        return openIndexedStream(
                version,
                data.getZipDataOffset(),
                data.getCompressedSize(),
                data.getUncompressedSize(),
                data.getSizeBytes(),
                data.getCompressionMethod(),
                data.getFileName(),
                data.getContentType()
        );
    }

    @Transactional(readOnly = true)
    public SampleFileStream openDataDownload(String dataId) {
        DatasetSampleData data = requireData(dataId);
        DatasetVersion version = requireReadyVersion(data.getDatasetVersionId(), DATA_NOT_FOUND);
        return openIndexedStream(
                version,
                data.getZipDataOffset(),
                data.getCompressedSize(),
                data.getUncompressedSize(),
                data.getSizeBytes(),
                data.getCompressionMethod(),
                data.getFileName(),
                data.getContentType()
        );
    }

    @Transactional(readOnly = true)
    public SampleFileStream openAnnotationDownload(String annotationId) {
        DatasetAnnotation annotation = requireAnnotation(annotationId);
        DatasetVersion version = requireReadyVersion(
                annotation.getDatasetVersionId(),
                ANNOTATION_NOT_FOUND
        );
        return openIndexedStream(
                version,
                annotation.getZipDataOffset(),
                annotation.getCompressedSize(),
                annotation.getUncompressedSize(),
                annotation.getSizeBytes(),
                annotation.getCompressionMethod(),
                annotation.getFileName(),
                annotation.getContentType()
        );
    }

    private DatasetSampleData requireData(String dataId) {
        if (dataId == null || dataId.isBlank()) {
            throw new SampleFileException(HttpStatus.NOT_FOUND, DATA_NOT_FOUND);
        }
        return dataRepo.findById(dataId)
                .orElseThrow(() -> new SampleFileException(HttpStatus.NOT_FOUND, DATA_NOT_FOUND));
    }

    private DatasetAnnotation requireAnnotation(String annotationId) {
        if (annotationId == null || annotationId.isBlank()) {
            throw new SampleFileException(HttpStatus.NOT_FOUND, ANNOTATION_NOT_FOUND);
        }
        return annotationRepo.findById(annotationId)
                .orElseThrow(() ->
                        new SampleFileException(HttpStatus.NOT_FOUND, ANNOTATION_NOT_FOUND)
                );
    }

    private DatasetVersion requireReadyVersionForData(DatasetSampleData data) {
        if (data.getSampleId() == null || data.getSampleId().isBlank()) {
            throw new SampleFileException(HttpStatus.NOT_FOUND, DATA_NOT_FOUND);
        }
        DatasetSample sample = sampleRepo.findByIdAndDeletedFalse(data.getSampleId())
                .orElseThrow(() -> new SampleFileException(HttpStatus.NOT_FOUND, DATA_NOT_FOUND));
        if (sample.getDatasetVersionId() == null
                || !sample.getDatasetVersionId().equals(data.getDatasetVersionId())) {
            throw new SampleFileException(HttpStatus.NOT_FOUND, DATA_NOT_FOUND);
        }
        return requireReadyVersion(sample.getDatasetVersionId(), DATA_NOT_FOUND);
    }

    private DatasetVersion requireReadyVersion(String versionId, String errorMessage) {
        if (versionId == null || versionId.isBlank()) {
            throw new SampleFileException(HttpStatus.NOT_FOUND, errorMessage);
        }
        DatasetVersion version = versionRepo.findByIdAndDeletedFalse(versionId)
                .orElseThrow(() -> new SampleFileException(HttpStatus.NOT_FOUND, errorMessage));
        if (!"READY".equals(version.getStatus())) {
            throw new SampleFileException(HttpStatus.NOT_FOUND, errorMessage);
        }
        DatasetAsset asset = assetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(() -> new SampleFileException(HttpStatus.NOT_FOUND, errorMessage));
        if (!authContext.canAccessOwner(asset.getOwnerUserId())) {
            throw new SampleFileException(HttpStatus.NOT_FOUND, errorMessage);
        }
        if (version.getStoragePath() == null || version.getStoragePath().isBlank()) {
            throw new SampleFileException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "sample file storage is unavailable"
            );
        }
        return version;
    }

    private SampleFileStream openIndexedStream(
            DatasetVersion version,
            Long zipDataOffset,
            Long compressedSize,
            Long uncompressedSize,
            Long sizeBytes,
            String compressionMethod,
            String fileName,
            String contentType
    ) {
        validateIndex(zipDataOffset, compressedSize, compressionMethod);
        String method = compressionMethod.toUpperCase(Locale.ROOT);
        if (!"STORED".equals(method) && !"DEFLATED".equals(method)) {
            throw new SampleFileException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "unsupported ZIP compression method"
            );
        }

        InputStream compressed;
        try {
            compressed = compressedSize == 0
                    ? InputStream.nullInputStream()
                    : minioService.downloadRange(
                            version.getStoragePath(),
                            zipDataOffset,
                            compressedSize
                    );
        } catch (Exception exception) {
            throw new SampleFileException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "sample file stream could not be opened",
                    exception
            );
        }

        InputStream result = "DEFLATED".equals(method)
                ? rawDeflateStream(compressed)
                : compressed;
        return new SampleFileStream(
                result,
                fileName,
                contentType,
                effectiveSize(uncompressedSize, sizeBytes)
        );
    }

    private SampleFileStream openStoredVideoPreview(
            DatasetVersion version,
            DatasetSampleData data,
            String rangeHeader
    ) {
        String compressionMethod = data.getCompressionMethod();
        if (compressionMethod == null || compressionMethod.isBlank()) {
            throw unsupportedVideoCompression();
        }
        String method = compressionMethod.toUpperCase(Locale.ROOT);
        if ("DEFLATED".equals(method)) {
            throw new SampleFileException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "DEFLATED video preview is not supported; use download"
            );
        }
        if (!"STORED".equals(method)) {
            throw unsupportedVideoCompression();
        }

        Long zipDataOffset = data.getZipDataOffset();
        Long compressedSize = data.getCompressedSize();
        Long uncompressedSize = data.getUncompressedSize();
        if (zipDataOffset == null
                || zipDataOffset < 0
                || compressedSize == null
                || compressedSize < 0
                || uncompressedSize == null
                || uncompressedSize < 0) {
            throw new SampleFileException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "VIDEO ZIP entry index is incomplete"
            );
        }
        if (!compressedSize.equals(uncompressedSize)) {
            throw new SampleFileException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "STORED video compressed and uncompressed sizes differ"
            );
        }

        ResolvedRange range = resolveRange(rangeHeader, uncompressedSize);
        InputStream inputStream;
        if (range.length() == 0) {
            inputStream = InputStream.nullInputStream();
        } else {
            long actualOffset;
            try {
                actualOffset = Math.addExact(zipDataOffset, range.start());
            } catch (ArithmeticException exception) {
                throw new SampleFileException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "VIDEO ZIP entry offset is invalid"
                );
            }
            inputStream = openRange(version.getStoragePath(), actualOffset, range.length());
        }

        return new SampleFileStream(
                inputStream,
                data.getFileName(),
                videoContentType(data.getContentType()),
                range.length(),
                true,
                range.partial(),
                range.start(),
                range.end(),
                range.total()
        );
    }

    private InputStream openRange(String objectName, long offset, long length) {
        try {
            return minioService.downloadRange(objectName, offset, length);
        } catch (Exception exception) {
            throw new SampleFileException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "sample file stream could not be opened",
                    exception
            );
        }
    }

    private static ResolvedRange resolveRange(String rangeHeader, long total) {
        if (rangeHeader == null || rangeHeader.isBlank()) {
            return total == 0
                    ? new ResolvedRange(0, -1, total, false)
                    : new ResolvedRange(0, total - 1, total, false);
        }
        if (total == 0) {
            throw rangeNotSatisfiable(total);
        }

        String value = rangeHeader.trim();
        if (!value.regionMatches(true, 0, "bytes=", 0, 6)) {
            throw rangeNotSatisfiable(total);
        }
        String specification = value.substring(6).trim();
        if (specification.isEmpty() || specification.indexOf(',') >= 0) {
            throw rangeNotSatisfiable(total);
        }

        int dash = specification.indexOf('-');
        if (dash < 0 || dash != specification.lastIndexOf('-')) {
            throw rangeNotSatisfiable(total);
        }
        String startText = specification.substring(0, dash).trim();
        String endText = specification.substring(dash + 1).trim();
        if (startText.isEmpty() && endText.isEmpty()) {
            throw rangeNotSatisfiable(total);
        }

        if (startText.isEmpty()) {
            long suffixLength = parseRangeNumber(endText, total);
            if (suffixLength <= 0) {
                throw rangeNotSatisfiable(total);
            }
            long start = suffixLength >= total ? 0 : total - suffixLength;
            return new ResolvedRange(start, total - 1, total, true);
        }

        long start = parseRangeNumber(startText, total);
        if (start >= total) {
            throw rangeNotSatisfiable(total);
        }
        long end;
        if (endText.isEmpty()) {
            end = total - 1;
        } else {
            end = parseRangeNumber(endText, total);
            if (end < start || end >= total) {
                throw rangeNotSatisfiable(total);
            }
        }
        return new ResolvedRange(start, end, total, true);
    }

    private static long parseRangeNumber(String value, long total) {
        if (value.isEmpty()) {
            throw rangeNotSatisfiable(total);
        }
        for (int index = 0; index < value.length(); index++) {
            if (!Character.isDigit(value.charAt(index))) {
                throw rangeNotSatisfiable(total);
            }
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw rangeNotSatisfiable(total);
        }
    }

    private static SampleFileException rangeNotSatisfiable(long total) {
        return new SampleFileException(
                HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
                "requested range is not satisfiable",
                total
        );
    }

    private static SampleFileException unsupportedVideoCompression() {
        return new SampleFileException(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "video preview requires a STORED ZIP entry"
        );
    }

    private static boolean isVideo(DatasetSampleData data) {
        return data.getDataType() != null
                && "VIDEO".equalsIgnoreCase(data.getDataType());
    }

    private static String videoContentType(String contentType) {
        return contentType == null || contentType.isBlank() ? "video/mp4" : contentType;
    }

    private static void validateIndex(
            Long zipDataOffset,
            Long compressedSize,
            String compressionMethod
    ) {
        if (zipDataOffset == null
                || zipDataOffset < 0
                || compressedSize == null
                || compressedSize < 0
                || compressionMethod == null
                || compressionMethod.isBlank()) {
            throw new SampleFileException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "ZIP entry index is incomplete"
            );
        }
    }

    private static void validatePreviewType(DatasetSampleData data) {
        String dataType = data.getDataType() == null
                ? ""
                : data.getDataType().toUpperCase(Locale.ROOT);
        if ("AUDIO".equals(dataType)) {
            throw new SampleFileException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "audio preview is not implemented"
            );
        }
        if ("IMAGE".equals(dataType)
                || "TEXT".equals(dataType)
                || "POINT_CLOUD".equals(dataType)) {
            return;
        }
        if ("OTHER".equals(dataType) && isSafeOtherContentType(data.getContentType())) {
            return;
        }
        throw new SampleFileException(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                "sample data type is not supported for preview"
        );
    }

    private static boolean isSafeOtherContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return false;
        }
        String normalized = contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return SAFE_OTHER_CONTENT_TYPES.contains(normalized);
    }

    private static Long effectiveSize(Long uncompressedSize, Long sizeBytes) {
        if (uncompressedSize != null && uncompressedSize >= 0) {
            return uncompressedSize;
        }
        return sizeBytes != null && sizeBytes >= 0 ? sizeBytes : null;
    }

    private static InputStream rawDeflateStream(InputStream compressed) {
        Inflater inflater = new Inflater(true);
        return new InflaterInputStream(compressed, inflater) {
            private boolean closed;

            @Override
            public void close() throws IOException {
                if (closed) {
                    return;
                }
                closed = true;
                try {
                    super.close();
                } finally {
                    inflater.end();
                }
            }
        };
    }

    private record ResolvedRange(long start, long end, long total, boolean partial) {
        private long length() {
            return end < start ? 0 : end - start + 1;
        }
    }

    public record SampleFileStream(
            InputStream inputStream,
            String fileName,
            String contentType,
            Long sizeBytes,
            boolean rangeSupported,
            boolean partial,
            Long rangeStart,
            Long rangeEnd,
            Long totalSize
    ) {
        public SampleFileStream(
                InputStream inputStream,
                String fileName,
                String contentType,
                Long sizeBytes
        ) {
            this(
                    inputStream,
                    fileName,
                    contentType,
                    sizeBytes,
                    false,
                    false,
                    null,
                    null,
                    sizeBytes
            );
        }
    }
}
