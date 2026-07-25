package com.tss.platform.service;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.ComputeServer;
import com.tss.platform.entity.InferenceTask;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.ComputeServerRepository;
import com.tss.platform.repository.InferenceTaskRepository;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.training.TrainingExecutorRouter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 自定义训练/推理任务调度器。
 * 从匹配 nodeSelector 的在线节点中选出剩余资源最多的，决定跑在哪个节点上。
 * 资源不足时将任务标记为 queued，由定时任务自动重试分配。
 */
@Service
public class JobScheduler {

    private static final Logger LOG = LoggerFactory.getLogger(JobScheduler.class);

    private final ComputeServerRepository computeServerRepo;
    private final TrainingExperimentVersionRepository trainingRepo;
    private final InferenceTaskRepository inferenceRepo;
    private final TrainingKubernetesProperties k8sProperties;
    private final TrainingExecutorRouter executorRouter;

    public JobScheduler(
            ComputeServerRepository computeServerRepo,
            TrainingExperimentVersionRepository trainingRepo,
            InferenceTaskRepository inferenceRepo,
            TrainingKubernetesProperties k8sProperties,
            @Lazy TrainingExecutorRouter executorRouter) {
        this.computeServerRepo = computeServerRepo;
        this.trainingRepo = trainingRepo;
        this.inferenceRepo = inferenceRepo;
        this.k8sProperties = k8sProperties;
        this.executorRouter = executorRouter;
    }

    /**
     * 为训练任务分配节点。从 task.runSpecJson 读取资源需求，匹配 nodeSelector 的在线节点中选剩余最多的。
     * @return 分配的 nodeName，资源不足返回 null
     */
    public String assignNodeForTraining(TrainingExperimentVersion task, Map<String, String> nodeSelector) {
        double[] req = resolveResourceRequest(task);
        Integer gpuReq = req[2] > 0 ? (int) req[2] : null;
        return assignNode(nodeSelector, req[0], req[1], gpuReq);
    }

    /**
     * 调度时将任务绑定到节点。
     */
    public void bindTask(TrainingExperimentVersion task, String nodeName) {
        task.setServerIp(nodeName);
        task.setUpdatedAt(java.time.Instant.now());
        trainingRepo.save(task);
        LOG.info("任务已绑定节点: taskId={}, node={}", task.getId(), nodeName);
    }

    /**
     * 标记任务排队。
     */
    public void enqueueTask(TrainingExperimentVersion task) {
        task.setStatus("queued");
        task.setUpdatedAt(java.time.Instant.now());
        trainingRepo.save(task);
        LOG.info("任务排队等待: taskId={}", task.getId());
    }

    /**
     * 任务结束/失败时释放资源。当前通过 server_ip 查询即可，无需额外账本。
     */
    public void releaseResources(String trainingId, String nodeName) {
        LOG.info("释放节点资源: taskId={}, node={}", trainingId, nodeName);
    }

    /**
     * 定时调度：每 10 秒扫描 status=queued 的任务，尝试分配节点。
     */
    @Scheduled(fixedDelay = 10_000)
    public void dispatchQueuedTasks() {
        List<TrainingExperimentVersion> queued = trainingRepo
                .findByStatusAndServerIpIsNullOrderByPriorityAscCreatedAtAsc("queued");

        if (queued.isEmpty()) return;

        for (TrainingExperimentVersion task : queued) {
            try {
                Map<String, String> nodeSelector = resolveNodeSelector(task);
                double[] req = resolveResourceRequest(task);
                Integer gpuReq = req[2] > 0 ? (int) req[2] : null;
                String node = assignNode(nodeSelector, req[0], req[1], gpuReq);
                if (node != null) {
                    bindTask(task, node);
                    executorRouter.start(task.getId());
                } else {
                    break; // 资源不足，后面也分配不了
                }
            } catch (Exception e) {
                LOG.warn("调度排队任务失败: taskId={}, error={}", task.getId(), e.getMessage());
            }
        }
    }

    // ── 内部逻辑 ──

    /**
     * 核心分配算法：
     * 1. 筛选匹配 nodeSelector 的 online 节点
     * 2. 计算每个节点已分配资源（status=running 的任务）
     * 3. 算剩余容量 = 总容量 - 已分配
     * 4. 选剩余最多的，且能满足本次请求的
     */
    private String assignNode(Map<String, String> nodeSelector, double cpuReq, double memReq, Integer gpuReq) {
        List<ComputeServer> candidates = computeServerRepo.findByDeletedFalse().stream()
                .filter(n -> "online".equals(n.getStatus()) && Boolean.TRUE.equals(n.getEnabled()))
                .collect(Collectors.toList());

        if (candidates.isEmpty()) return null;

        // 按 nodeSelector 筛选
        if (nodeSelector != null && !nodeSelector.isEmpty()) {
            candidates = candidates.stream()
                    .filter(n -> matchesNodeSelector(n, nodeSelector))
                    .collect(Collectors.toList());
        }

        // 统计每个节点的已分配资源（从每个 running 任务的 runSpecJson 读取）
        Map<String, Double> allocatedCpu = new LinkedHashMap<>();
        Map<String, Double> allocatedMemGib = new LinkedHashMap<>();
        Map<String, Integer> allocatedGpu = new LinkedHashMap<>();
        for (TrainingExperimentVersion t : trainingRepo.findByStatus("running")) {
            String ip = t.getServerIp();
            if (ip != null) {
                double[] req = resolveResourceRequest(t);
                allocatedCpu.merge(ip, req[0], Double::sum);
                allocatedMemGib.merge(ip, req[1], Double::sum);
                if (req[2] > 0) allocatedGpu.merge(ip, (int) req[2], Integer::sum);
            }
        }
        for (InferenceTask t : inferenceRepo.findByStatus("running")) {
            String ip = t.getServerIp();
            if (ip != null) {
                double[] req = resolveResourceRequest(t);
                allocatedCpu.merge(ip, req[0], Double::sum);
                allocatedMemGib.merge(ip, req[1], Double::sum);
                if (req[2] > 0) allocatedGpu.merge(ip, (int) req[2], Integer::sum);
            }
        }

        // 选剩余最多的
        ComputeServer best = null;
        double bestRemaining = -1;
        for (ComputeServer node : candidates) {
            double usedCpu = allocatedCpu.getOrDefault(node.getServerIp(), 0.0);
            double usedMem = allocatedMemGib.getOrDefault(node.getServerIp(), 0.0);
            int usedGpu = allocatedGpu.getOrDefault(node.getServerIp(), 0);
            double totalCpu = node.getCpuCores() != null ? node.getCpuCores() : 0;
            double totalMem = node.getMemoryGib() != null ? node.getMemoryGib() : 0;
            int totalGpu = node.getGpuCount() != null ? node.getGpuCount() : 0;

            double remCpu = totalCpu - usedCpu;
            double remMem = totalMem - usedMem;
            int remGpu = totalGpu - usedGpu;
            double remScore = Math.min(remCpu / Math.max(cpuReq, 0.001), remMem / Math.max(memReq, 0.001));

            boolean gpuOk = gpuReq == null || remGpu >= gpuReq;
            if (remCpu >= cpuReq && remMem >= memReq && gpuOk && remScore > bestRemaining) {
                bestRemaining = remScore;
                best = node;
            }
        }

        return best != null ? best.getServerIp() : null;
    }

    public Map<String, String> resolveNodeSelector(TrainingExperimentVersion task) {
        // 从 RunSpec 或 trainingProfile 获取 nodeSelector
        // 如果有 runSpecJson，解析获取；否则按 trainingProfile 的默认值
        try {
            if (task.getRunSpecJson() != null && !task.getRunSpecJson().isBlank()) {
                JsonNode runSpec = new ObjectMapper().readTree(task.getRunSpecJson());
                JsonNode ns = runSpec.path("resources").path("nodeSelector");
                if (ns.isObject()) {
                    Map<String, String> map = new LinkedHashMap<>();
                    ns.fields().forEachRemaining(e -> map.put(e.getKey(), e.getValue().asText()));
                    return map;
                }
            }
        } catch (Exception ignored) {}
        // 默认：CPU 节点池
        return Map.of("tss.ai/node-pool", "cpu");
    }

    /** 从 task.runSpecJson 读取资源需求，读不到则 fallback 到 application.yml 全局配置 */
    double[] resolveResourceRequest(TrainingExperimentVersion task) {
        if (task.getRunSpecJson() != null && !task.getRunSpecJson().isBlank()) {
            double[] req = parseResourcesFromRunSpecJson(task.getRunSpecJson());
            if (req != null) return req;
        }
        return new double[]{
                parseCpuToCores(k8sProperties.getCpuRequest()),
                parseMemToGib(k8sProperties.getMemoryRequest()), 0
        };
    }

    /** 推理任务暂用全局配置，后续可扩展 */
    double[] resolveResourceRequest(InferenceTask task) {
        return new double[]{
                parseCpuToCores(k8sProperties.getCpuRequest()),
                parseMemToGib(k8sProperties.getMemoryRequest()), 0
        };
    }

    private double[] parseResourcesFromRunSpecJson(String json) {
        try {
            JsonNode runSpec = new ObjectMapper().readTree(json);
            JsonNode resources = runSpec.path("resources");
            double cpu = parseCpuToCores(resources.path("cpuRequest").asText("500m"));
            double mem = parseMemToGib(resources.path("memoryRequest").asText("512Mi"));
            double gpu = resources.path("gpuCount").asDouble(0);
            return new double[]{cpu, mem, gpu};
        } catch (Exception e) {
            return null;
        }
    }

    private boolean matchesNodeSelector(ComputeServer node, Map<String, String> selector) {
        // 从 k8s_labels_json 解析 K8s 标签
        try {
            String labelsJson = node.getK8sLabelsJson();
            if (labelsJson == null || labelsJson.isBlank()) return true;
            JsonNode labels = new ObjectMapper().readTree(labelsJson);
            for (Map.Entry<String, String> e : selector.entrySet()) {
                String val = labels.has(e.getKey()) ? labels.get(e.getKey()).asText() : null;
                if (!e.getValue().equals(val)) return false;
            }
            return true;
        } catch (Exception ignored) {
            return true;
        }
    }

    // ── 工具方法 ──

    static double parseCpuToCores(String s) {
        if (s == null || s.isEmpty()) return 0.5;
        s = s.trim();
        if (s.endsWith("m")) return Double.parseDouble(s.replace("m", "")) / 1000.0;
        return Double.parseDouble(s);
    }

    static double parseMemToGib(String s) {
        if (s == null || s.isEmpty()) return 0.5;
        s = s.trim();
        if (s.endsWith("Mi")) return Double.parseDouble(s.replace("Mi", "")) / 1024.0;
        if (s.endsWith("Gi")) return Double.parseDouble(s.replace("Gi", ""));
        if (s.endsWith("Ki")) return Double.parseDouble(s.replace("Ki", "")) / (1024.0 * 1024.0);
        return Double.parseDouble(s) / (1024.0 * 1024.0 * 1024.0);
    }
}
