package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.config.TrainingMlflowProperties;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.entity.TrainingExperimentVersion;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class MlflowTrackingService {
    private final TrainingMlflowProperties properties;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    public MlflowTrackingService(TrainingMlflowProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public String createRun(
            TrainingExperimentVersion task,
            ModelVersion modelVersion,
            DatasetVersion datasetVersion
    ) {
        if (!properties.isEnabled()) {
            return null;
        }
        String experimentId = ensureExperiment();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("experiment_id", experimentId);
        body.put("start_time", Instant.now().toEpochMilli());
        body.put("tags", List.of(
                tag("mlflow.runName", task.getName() == null ? task.getId() : task.getName()),
                tag("tss.training_id", task.getId()),
                tag("tss.experiment_id", task.getExperimentId()),
                tag("tss.model_version_id", task.getModelVersionId()),
                tag("tss.dataset_version_id", task.getDatasetVersionId()),
                tag("tss.model_storage_path", modelVersion.getStoragePath()),
                tag("tss.dataset_storage_path", datasetVersion.getStoragePath())
        ));
        Map<?, ?> response = post("/api/2.0/mlflow/runs/create", body);
        Object run = response.get("run");
        if (run instanceof Map<?, ?> runMap) {
            Object info = runMap.get("info");
            if (info instanceof Map<?, ?> infoMap && infoMap.get("run_id") != null) {
                return infoMap.get("run_id").toString();
            }
        }
        throw new IllegalStateException("MLflow 创建 run 未返回 run_id");
    }

    public void logMetrics(String runId, Map<String, Double> metrics, int step) {
        if (!canWrite(runId) || metrics.isEmpty()) {
            return;
        }
        long timestamp = Instant.now().toEpochMilli();
        List<Map<String, Object>> records = new ArrayList<>();
        for (Map.Entry<String, Double> metric : metrics.entrySet()) {
            records.add(Map.of(
                    "key", metric.getKey(),
                    "value", metric.getValue(),
                    "timestamp", timestamp,
                    "step", step
            ));
        }
        post("/api/2.0/mlflow/runs/log-batch", Map.of(
                "run_id", runId,
                "metrics", records
        ));
    }

    public void logParams(String runId, Map<String, String> params) {
        if (!canWrite(runId) || params.isEmpty()) {
            return;
        }
        List<Map<String, String>> records = new ArrayList<>();
        for (Map.Entry<String, String> param : params.entrySet()) {
            records.add(Map.of("key", param.getKey(), "value", param.getValue()));
        }
        post("/api/2.0/mlflow/runs/log-batch", Map.of(
                "run_id", runId,
                "params", records
        ));
    }

    public void finishRun(String runId, boolean success) {
        if (!canWrite(runId)) {
            return;
        }
        post("/api/2.0/mlflow/runs/update", Map.of(
                "run_id", runId,
                "status", success ? "FINISHED" : "FAILED",
                "end_time", Instant.now().toEpochMilli()
        ));
    }

    private String ensureExperiment() {
        try {
            Map<?, ?> response = restTemplate.getForObject(
                    baseUrl() + "/api/2.0/mlflow/experiments/get-by-name?experiment_name={name}",
                    Map.class,
                    properties.getExperimentName()
            );
            String existing = experimentIdFrom(response);
            if (existing != null) {
                return existing;
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() != HttpStatus.NOT_FOUND) {
                throw e;
            }
        }

        try {
            Map<?, ?> created = post("/api/2.0/mlflow/experiments/create", Map.of(
                    "name", properties.getExperimentName()
            ));
            Object experimentId = created.get("experiment_id");
            if (experimentId != null) {
                return experimentId.toString();
            }
        } catch (RestClientException ignored) {
            Map<?, ?> response = restTemplate.getForObject(
                    baseUrl() + "/api/2.0/mlflow/experiments/get-by-name?experiment_name={name}",
                    Map.class,
                    properties.getExperimentName()
            );
            String existing = experimentIdFrom(response);
            if (existing != null) {
                return existing;
            }
            throw ignored;
        }
        throw new IllegalStateException("MLflow 创建 experiment 未返回 experiment_id");
    }

    private String experimentIdFrom(Map<?, ?> response) {
        if (response == null) {
            return null;
        }
        Object experiment = response.get("experiment");
        if (experiment instanceof Map<?, ?> map && map.get("experiment_id") != null) {
            return map.get("experiment_id").toString();
        }
        return null;
    }

    private Map<String, String> tag(String key, String value) {
        return Map.of("key", key, "value", value == null ? "" : value);
    }

    private Map<?, ?> post(String path, Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            String raw = objectMapper.writeValueAsString(body);
            return restTemplate.postForObject(baseUrl() + path, new HttpEntity<>(raw, headers), Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("调用 MLflow 失败: " + e.getMessage(), e);
        }
    }

    private boolean canWrite(String runId) {
        return properties.isEnabled() && runId != null && !runId.isBlank();
    }

    private String baseUrl() {
        String raw = properties.getTrackingUri();
        if (raw == null || raw.isBlank()) {
            throw new IllegalStateException("training.mlflow.tracking-uri 不能为空");
        }
        return raw.endsWith("/") ? raw.substring(0, raw.length() - 1) : raw;
    }
}
