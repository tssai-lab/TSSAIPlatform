package com.tss.platform.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.model.ZipEntryInfo;
import com.tss.platform.model.manifest.ManifestAnnotation;
import com.tss.platform.model.manifest.ManifestData;
import com.tss.platform.model.manifest.ManifestImportPlan;
import com.tss.platform.model.manifest.ManifestSample;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class ManifestParser {

    private static final int MAX_SAMPLES = 10_000;
    private static final int MAX_REFERENCES = 100_000;
    private static final int MAX_DATA_PER_SAMPLE = 100;
    private static final int MAX_ANNOTATIONS_PER_SAMPLE = 100;
    private static final Set<String> DATA_TYPES = Set.of(
            "IMAGE", "TEXT", "POINT_CLOUD", "AUDIO", "VIDEO", "OTHER"
    );
    private static final Set<String> VIDEO_FORMATS = Set.of("mp4", "webm", "mov", "avi", "mkv");
    private static final TypeReference<LinkedHashMap<String, Object>> OBJECT_MAP_TYPE =
            new TypeReference<>() {
            };

    private final ObjectMapper objectMapper;

    public ManifestParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ManifestImportPlan parse(
            String manifestJson,
            List<ZipEntryInfo> zipEntries,
            String manifestPath
    ) {
        JsonNode root = parseRoot(manifestJson);
        String version = requiredText(root, "version", null, null);
        if (!"1.0".equals(version)) {
            throw error("version", null, null, "must equal 1.0");
        }

        JsonNode samplesNode = root.get("samples");
        if (samplesNode == null || !samplesNode.isArray() || samplesNode.isEmpty()) {
            throw error("samples", null, null, "must be a non-empty array");
        }
        if (samplesNode.size() > MAX_SAMPLES) {
            throw error("samples", null, null, "samples count exceeds 10000");
        }
        ReferenceCounts referenceCounts = validateReferenceCounts(samplesNode);

        Map<String, ZipEntryInfo> zipEntryMap = buildZipEntryMap(zipEntries);
        Set<String> externalIds = new LinkedHashSet<>();
        Set<Integer> sampleIndexes = new LinkedHashSet<>();
        Set<String> declaredPaths = new LinkedHashSet<>();
        List<ManifestSample> samples = new ArrayList<>(samplesNode.size());
        int totalDataCount = referenceCounts.dataCount();
        int totalAnnotationCount = referenceCounts.annotationCount();

        for (int position = 0; position < samplesNode.size(); position++) {
            JsonNode sampleNode = samplesNode.get(position);
            if (!sampleNode.isObject()) {
                throw error("samples[" + position + "]", null, null, "must be a JSON object");
            }
            String externalId = requiredText(sampleNode, "external_id", null, null);
            validateLength("external_id", externalId, 255, externalId, null);
            if (!externalIds.add(externalId)) {
                throw new ManifestValidationException("duplicate external_id: " + externalId);
            }

            int sampleIndex = optionalNonNegativeInt(
                    sampleNode.get("sample_index"),
                    position,
                    "sample_index",
                    externalId,
                    null
            );
            if (!sampleIndexes.add(sampleIndex)) {
                throw new ManifestValidationException(
                        "duplicate sample_index: " + sampleIndex + ", external_id: " + externalId
                );
            }

            Map<String, Object> tags = objectMap(sampleNode.get("tags"), "tags", externalId, null);
            Map<String, Object> metadata = objectMap(
                    sampleNode.get("metadata"),
                    "metadata",
                    externalId,
                    null
            );

            JsonNode dataNode = optionalArray(sampleNode.get("data"), "data", externalId);
            JsonNode annotationsNode = optionalArray(
                    sampleNode.get("annotations"),
                    "annotations",
                    externalId
            );
            List<ManifestData> data = parseData(
                    dataNode,
                    externalId,
                    zipEntryMap,
                    declaredPaths
            );
            Map<String, ManifestData> currentSampleData = new LinkedHashMap<>();
            for (ManifestData item : data) {
                currentSampleData.put(item.path(), item);
            }
            List<ManifestAnnotation> annotations = parseAnnotations(
                    annotationsNode,
                    externalId,
                    zipEntryMap,
                    declaredPaths,
                    currentSampleData
            );
            samples.add(new ManifestSample(
                    externalId,
                    sampleIndex,
                    tags,
                    metadata,
                    data,
                    annotations
            ));
        }

        String normalizedManifestPath = normalizeManifestPath(manifestPath);
        List<String> warnings = buildWarnings(
                zipEntries,
                declaredPaths,
                normalizedManifestPath
        );
        return new ManifestImportPlan(
                version,
                samples,
                samples.size(),
                totalDataCount,
                totalAnnotationCount,
                warnings
        );
    }

    private List<ManifestData> parseData(
            JsonNode dataNode,
            String externalId,
            Map<String, ZipEntryInfo> zipEntryMap,
            Set<String> declaredPaths
    ) {
        List<ManifestData> data = new ArrayList<>(dataNode.size());
        Set<String> dataKeys = new LinkedHashSet<>();
        for (int index = 0; index < dataNode.size(); index++) {
            JsonNode item = dataNode.get(index);
            if (!item.isObject()) {
                throw error("data[" + index + "]", externalId, null, "must be a JSON object");
            }
            String path = validatedDeclaredPath(
                    item,
                    "path",
                    "data.path",
                    externalId,
                    zipEntryMap,
                    declaredPaths
            );
            String dataType = requiredText(item, "data_type", externalId, path);
            if (!DATA_TYPES.contains(dataType)) {
                throw error("data_type", externalId, path, "unsupported value: " + dataType);
            }
            String sensor = optionalText(item, "sensor", externalId, path);
            String channel = optionalText(item, "channel", externalId, path);
            String format = optionalText(item, "format", externalId, path);
            validateLength("sensor", sensor, 64, externalId, path);
            validateLength("channel", channel, 32, externalId, path);
            validateLength("format", format, 32, externalId, path);

            int seq = optionalNonNegativeInt(item.get("seq"), 0, "seq", externalId, path);
            String key = dataType + "\u0000" + nullToEmpty(sensor) + "\u0000"
                    + nullToEmpty(channel) + "\u0000" + seq;
            if (!dataKeys.add(key)) {
                throw error(
                        "data",
                        externalId,
                        path,
                        "duplicate data_type + sensor + channel + seq"
                );
            }

            String fileName = fileName(path);
            validateLength("fileName", fileName, 255, externalId, path);
            String extension = extension(fileName);
            if ("VIDEO".equals(dataType)) {
                validateVideo(extension, format, externalId, path);
            }
            Map<String, Object> metadata = objectMap(
                    item.get("metadata"),
                    "data.metadata",
                    externalId,
                    path
            );
            data.add(new ManifestData(
                    path,
                    dataType,
                    sensor,
                    channel,
                    seq,
                    format,
                    fileName,
                    inferContentType(extension),
                    metadata,
                    zipEntryMap.get(path)
            ));
        }
        return data;
    }

    private List<ManifestAnnotation> parseAnnotations(
            JsonNode annotationsNode,
            String externalId,
            Map<String, ZipEntryInfo> zipEntryMap,
            Set<String> declaredPaths,
            Map<String, ManifestData> currentSampleData
    ) {
        List<ManifestAnnotation> annotations = new ArrayList<>(annotationsNode.size());
        for (int index = 0; index < annotationsNode.size(); index++) {
            JsonNode item = annotationsNode.get(index);
            if (!item.isObject()) {
                throw error(
                        "annotations[" + index + "]",
                        externalId,
                        null,
                        "must be a JSON object"
                );
            }
            String path = validatedDeclaredPath(
                    item,
                    "path",
                    "annotations.path",
                    externalId,
                    zipEntryMap,
                    declaredPaths
            );
            String annotationType = requiredText(item, "annotation_type", externalId, path);
            String format = requiredText(item, "format", externalId, path);
            validateLength("annotation_type", annotationType, 64, externalId, path);
            validateLength("format", format, 32, externalId, path);

            String refDataPath = optionalText(item, "ref_data_path", externalId, path);
            if (refDataPath != null) {
                refDataPath = normalizePath(refDataPath, "ref_data_path", externalId);
                if (!currentSampleData.containsKey(refDataPath)) {
                    throw error(
                            "ref_data_path",
                            externalId,
                            refDataPath,
                            "ref_data_path not found in current sample"
                    );
                }
            }

            String fileName = fileName(path);
            validateLength("fileName", fileName, 255, externalId, path);
            Map<String, Object> metadata = objectMap(
                    item.get("metadata"),
                    "annotation.metadata",
                    externalId,
                    path
            );
            annotations.add(new ManifestAnnotation(
                    path,
                    annotationType,
                    format,
                    refDataPath,
                    fileName,
                    inferContentType(extension(fileName)),
                    metadata,
                    zipEntryMap.get(path)
            ));
        }
        return annotations;
    }

    private String validatedDeclaredPath(
            JsonNode item,
            String jsonField,
            String errorField,
            String externalId,
            Map<String, ZipEntryInfo> zipEntryMap,
            Set<String> declaredPaths
    ) {
        String rawPath = requiredText(item, jsonField, externalId, null);
        String path = normalizePath(rawPath, errorField, externalId);
        if (!declaredPaths.add(path)) {
            throw new ManifestValidationException(
                    "duplicate manifest path: " + path + ", external_id: " + externalId
            );
        }
        if (!zipEntryMap.containsKey(path)) {
            throw new ManifestValidationException(
                    "path not found in zip: " + path + ", external_id: " + externalId
            );
        }
        if (zipEntryMap.get(path).directory()) {
            throw error(errorField, externalId, path, "path points to a directory");
        }
        return path;
    }

    private static String normalizePath(String rawPath, String field, String externalId) {
        if (rawPath == null || rawPath.isBlank()) {
            throw error(field, externalId, rawPath, "must be non-empty");
        }
        if (rawPath.length() > 1024) {
            throw error(field, externalId, rawPath, "length exceeds 1024");
        }
        try {
            return ZipCentralDirectoryReader.normalizePath(rawPath);
        } catch (IllegalArgumentException exception) {
            throw error(field, externalId, rawPath, exception.getMessage());
        }
    }

    private static Map<String, ZipEntryInfo> buildZipEntryMap(List<ZipEntryInfo> zipEntries) {
        if (zipEntries == null) {
            throw error("zipEntries", null, null, "cannot be null");
        }
        Map<String, ZipEntryInfo> entries = new LinkedHashMap<>();
        for (ZipEntryInfo entry : zipEntries) {
            if (entry == null) {
                throw error("zipEntries", null, null, "cannot contain null");
            }
            ZipEntryInfo previous = entries.putIfAbsent(entry.normalizedPath(), entry);
            if (previous != null) {
                throw error(
                        "zipEntries",
                        null,
                        entry.normalizedPath(),
                        "duplicate normalized ZIP path"
                );
            }
        }
        return entries;
    }

    private static ReferenceCounts validateReferenceCounts(JsonNode samplesNode) {
        int dataCount = 0;
        int annotationCount = 0;
        for (int index = 0; index < samplesNode.size(); index++) {
            JsonNode sample = samplesNode.get(index);
            if (!sample.isObject()) {
                throw error("samples[" + index + "]", null, null, "must be a JSON object");
            }
            JsonNode externalIdNode = sample.get("external_id");
            String externalId = externalIdNode != null && externalIdNode.isTextual()
                    ? externalIdNode.textValue()
                    : null;
            JsonNode data = optionalArray(sample.get("data"), "data", externalId);
            JsonNode annotations = optionalArray(
                    sample.get("annotations"),
                    "annotations",
                    externalId
            );
            if (data.size() > MAX_DATA_PER_SAMPLE) {
                throw error("data", externalId, null, "data count exceeds 100");
            }
            if (annotations.size() > MAX_ANNOTATIONS_PER_SAMPLE) {
                throw error("annotations", externalId, null, "annotations count exceeds 100");
            }
            dataCount = addReferenceCount(dataCount, data.size());
            annotationCount = addReferenceCount(annotationCount, annotations.size());
            if ((long) dataCount + annotationCount > MAX_REFERENCES) {
                throw error(
                        "samples",
                        externalId,
                        null,
                        "data and annotations references exceed 100000"
                );
            }
        }
        return new ReferenceCounts(dataCount, annotationCount);
    }

    private static List<String> buildWarnings(
            List<ZipEntryInfo> zipEntries,
            Set<String> declaredPaths,
            String manifestPath
    ) {
        List<String> warnings = new ArrayList<>();
        for (ZipEntryInfo entry : zipEntries) {
            if (!entry.directory()
                    && !entry.normalizedPath().equals(manifestPath)
                    && !declaredPaths.contains(entry.normalizedPath())) {
                warnings.add("undeclared zip entry: " + entry.normalizedPath());
            }
        }
        return warnings;
    }

    private static String normalizeManifestPath(String manifestPath) {
        try {
            String safePath = DatasetUploadService.normalizeManifestPath("MANIFEST", manifestPath);
            return ZipCentralDirectoryReader.normalizePath(safePath);
        } catch (IllegalArgumentException exception) {
            throw error("manifestPath", null, manifestPath, exception.getMessage());
        }
    }

    private JsonNode parseRoot(String manifestJson) {
        if (manifestJson == null || manifestJson.isBlank()) {
            throw error("manifestJson", null, null, "cannot be blank");
        }
        try {
            JsonNode root = objectMapper.readTree(manifestJson);
            if (root == null || !root.isObject()) {
                throw error("manifestJson", null, null, "root must be a JSON object");
            }
            return root;
        } catch (JsonProcessingException exception) {
            throw new ManifestValidationException("invalid manifest JSON: " + exception.getOriginalMessage(), exception);
        }
    }

    private static JsonNode optionalArray(JsonNode node, String field, String externalId) {
        if (node == null || node.isNull()) {
            return com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
        }
        if (!node.isArray()) {
            throw error(field, externalId, null, "must be a JSON array");
        }
        return node;
    }

    private Map<String, Object> objectMap(
            JsonNode node,
            String field,
            String externalId,
            String path
    ) {
        if (node == null || node.isNull()) {
            return Map.of();
        }
        if (!node.isObject()) {
            throw error(field, externalId, path, "must be a JSON object");
        }
        return objectMapper.convertValue(node, OBJECT_MAP_TYPE);
    }

    private static String requiredText(
            JsonNode object,
            String field,
            String externalId,
            String path
    ) {
        JsonNode node = object.get(field);
        if (node == null || !node.isTextual() || node.textValue().isBlank()) {
            throw error(field, externalId, path, "must be a non-empty string");
        }
        return node.textValue();
    }

    private static String optionalText(
            JsonNode object,
            String field,
            String externalId,
            String path
    ) {
        JsonNode node = object.get(field);
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isTextual()) {
            throw error(field, externalId, path, "must be a string");
        }
        return node.textValue();
    }

    private static int optionalNonNegativeInt(
            JsonNode node,
            int defaultValue,
            String field,
            String externalId,
            String path
    ) {
        if (node == null || node.isNull()) {
            return defaultValue;
        }
        if (!node.isIntegralNumber() || !node.canConvertToInt()) {
            throw error(field, externalId, path, "must be an integer");
        }
        int value = node.intValue();
        if (value < 0) {
            throw error(field, externalId, path, "must be greater than or equal to zero");
        }
        return value;
    }

    private static void validateLength(
            String field,
            String value,
            int maxLength,
            String externalId,
            String path
    ) {
        if (value != null && value.length() > maxLength) {
            throw error(field, externalId, path, "length exceeds " + maxLength);
        }
    }

    private static void validateVideo(
            String extension,
            String format,
            String externalId,
            String path
    ) {
        if (!VIDEO_FORMATS.contains(extension)) {
            throw error("data.path", externalId, path, "invalid video format: " + extension);
        }
        String normalizedFormat = format == null ? null : format.toLowerCase(Locale.ROOT);
        if (!VIDEO_FORMATS.contains(normalizedFormat)) {
            throw error("format", externalId, path, "invalid video format: " + format);
        }
    }

    private static String inferContentType(String extension) {
        return switch (extension) {
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "txt" -> "text/plain";
            case "json" -> "application/json";
            case "csv" -> "text/csv";
            case "pcd" -> "application/vnd.pointcloud";
            case "ply" -> "application/vnd.ply";
            case "mp4" -> "video/mp4";
            case "webm" -> "video/webm";
            case "mov" -> "video/quicktime";
            case "avi" -> "video/x-msvideo";
            case "mkv" -> "video/x-matroska";
            default -> "application/octet-stream";
        };
    }

    private static String fileName(String path) {
        int slash = path.lastIndexOf('/');
        return slash < 0 ? path : path.substring(slash + 1);
    }

    private static String extension(String fileName) {
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static int addReferenceCount(int current, int increment) {
        long value = (long) current + increment;
        if (value > Integer.MAX_VALUE) {
            throw error("samples", null, null, "reference count overflow");
        }
        return (int) value;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static ManifestValidationException error(
            String field,
            String externalId,
            String path,
            String reason
    ) {
        StringBuilder message = new StringBuilder("field ").append(field);
        if (externalId != null) {
            message.append(", external_id: ").append(externalId);
        }
        if (path != null) {
            message.append(", path: ").append(path);
        }
        message.append(", reason: ").append(reason);
        return new ManifestValidationException(message.toString());
    }

    private record ReferenceCounts(int dataCount, int annotationCount) {
    }
}
