package com.tss.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.entity.ComputeServer;

import java.util.Map;

/** Shared node eligibility rules used by both assignment and read-only resource discovery. */
final class ComputeServerSchedulingPolicy {

    static final String PLATFORM_SCHEDULABLE_LABEL = "tss.ai/platform-schedulable";
    static final String PLATFORM_MAX_ACTIVE_TASKS_LABEL = "tss.ai/platform-max-active-tasks";
    static final String GPU_SCHEDULABLE_LABEL = "tss.ai/gpu-schedulable";
    static final String MODEL_CACHE_READY_LABEL = "tss.ai/model-cache-ready";

    private ComputeServerSchedulingPolicy() {
    }

    static boolean matchesNodeSelector(ComputeServer node, Map<String, String> selector) {
        if (selector == null || selector.isEmpty()) {
            return true;
        }
        boolean acceleratorRequired = selector.containsKey("tss.ai/accelerator");
        try {
            JsonNode labels = labels(node);
            if (labels == null) return !acceleratorRequired;
            if (acceleratorRequired
                    && "false".equalsIgnoreCase(labels.path(GPU_SCHEDULABLE_LABEL).asText())) {
                return false;
            }
            for (Map.Entry<String, String> entry : selector.entrySet()) {
                String actual = labels.has(entry.getKey()) ? labels.get(entry.getKey()).asText() : null;
                if (!entry.getValue().equals(actual)) return false;
            }
            return true;
        } catch (Exception ignored) {
            return !acceleratorRequired;
        }
    }

    static boolean isCacheReady(ComputeServer node) {
        try {
            JsonNode labels = labels(node);
            return labels != null && "true".equalsIgnoreCase(
                    labels.path(MODEL_CACHE_READY_LABEL).asText());
        } catch (Exception ignored) {
            return false;
        }
    }

    static boolean isPlatformSchedulable(ComputeServer node) {
        try {
            JsonNode labels = labels(node);
            if (labels == null) return true;
            JsonNode schedulable = labels.path(PLATFORM_SCHEDULABLE_LABEL);
            return schedulable.isMissingNode()
                    || !"false".equalsIgnoreCase(schedulable.asText());
        } catch (Exception ignored) {
            return true;
        }
    }

    static boolean isGpuSchedulable(ComputeServer node) {
        try {
            JsonNode labels = labels(node);
            return labels == null || !"false".equalsIgnoreCase(
                    labels.path(GPU_SCHEDULABLE_LABEL).asText());
        } catch (Exception ignored) {
            return true;
        }
    }

    static Integer maxActiveTasks(ComputeServer node) {
        try {
            JsonNode labels = labels(node);
            if (labels == null) return null;
            JsonNode value = labels.path(PLATFORM_MAX_ACTIVE_TASKS_LABEL);
            if (value.isMissingNode()) return null;
            int parsed = Integer.parseInt(value.asText());
            return parsed > 0 ? parsed : 0;
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static JsonNode labels(ComputeServer node) throws Exception {
        String raw = node.getK8sLabelsJson();
        if (raw == null || raw.isBlank()) return null;
        JsonNode labels = new ObjectMapper().readTree(raw);
        return labels.isObject() ? labels : null;
    }
}
