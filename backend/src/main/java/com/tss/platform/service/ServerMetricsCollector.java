package com.tss.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.config.ComputeProperties;
import com.tss.platform.entity.ComputeServer;
import com.tss.platform.entity.ServerMetricHistory;
import com.tss.platform.entity.ServerMetricSnapshot;
import com.tss.platform.repository.ComputeServerRepository;
import com.tss.platform.repository.ServerMetricHistoryRepository;
import com.tss.platform.repository.ServerMetricSnapshotRepository;
import com.tss.platform.training.ShellCommandRunner;
import com.tss.platform.training.TrainingEnvironmentService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ServerMetricsCollector {

    private static final Logger LOG = LoggerFactory.getLogger(ServerMetricsCollector.class);
    private static final Pattern TOP_LINE = Pattern.compile(
            "^([\\w.-]+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s*$");

    private final ComputeServerRepository serverRepo;
    private final ServerMetricSnapshotRepository snapshotRepo;
    private final ServerMetricHistoryRepository historyRepo;
    private final TrainingEnvironmentService envService;
    private final ShellCommandRunner shellRunner;
    private final ComputeProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public ServerMetricsCollector(
            ComputeServerRepository serverRepo,
            ServerMetricSnapshotRepository snapshotRepo,
            ServerMetricHistoryRepository historyRepo,
            TrainingEnvironmentService envService,
            ShellCommandRunner shellRunner,
            ComputeProperties properties,
            ObjectMapper objectMapper) {
        this.serverRepo = serverRepo;
        this.snapshotRepo = snapshotRepo;
        this.historyRepo = historyRepo;
        this.envService = envService;
        this.shellRunner = shellRunner;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    @Transactional
    @Scheduled(fixedDelayString = "${resource-monitor.metrics.collect-interval-ms:30000}")
    public void collectMetrics() {
        if (!isK8sReady()) return;

        // 获取各节点容量（CPU/内存/GPU）、OS 信息和节点标签
        Map<String, double[]> capacities = fetchNodeCapacities();
        Map<String, String> osInfo = fetchNodeOsInfo();
        Map<String, String> nodeLabels = fetchNodeLabelsJson();

        Map<String, TopData> topMetrics = collectTop();
        List<ComputeServer> servers = serverRepo.findByDeletedFalse();
        syncNodeLabels(servers, nodeLabels);
        Map<String, ComputeServer> ipMap = new LinkedHashMap<>();
        for (ComputeServer s : servers) {
            ipMap.put(s.getServerIp(), s);
        }

        for (ComputeServer server : servers) {
            try {
                double[] cap = capacities.get(server.getServerIp());
                if (cap != null) {
                    boolean updated = false;
                    if (server.getCpuCores() == null || server.getCpuCores() <= 0) {
                        server.setCpuCores(cap[0]);
                        updated = true;
                    }
                    if (server.getMemoryGib() == null || server.getMemoryGib() <= 0) {
                        server.setMemoryGib(cap[1]);
                        updated = true;
                    }
                    // 同步 GPU 数量
                    if (cap.length > 2 && cap[2] > 0 && (server.getGpuCount() == null || server.getGpuCount() <= 0)) {
                        server.setGpuCount((int) cap[2]);
                        updated = true;
                    }
                    // 同步 OS 信息（已有节点也会更新）
                    String osImage = osInfo.get(server.getServerIp());
                    if (osImage != null && !osImage.isEmpty()
                            && (server.getSpecOs() == null || server.getSpecOs().isBlank())) {
                        server.setSpecOs(osImage.length() > 64 ? osImage.substring(0, 64) : osImage);
                        updated = true;
                    }
                    if (updated) {
                        serverRepo.save(server);
                    }
                }
                collectOne(server, topMetrics.get(server.getServerIp()), cap);
            } catch (Exception e) {
                LOG.debug("采集 {} 失败: {}", server.getServerIp(), e.getMessage());
            }
        }

        // 把 K8s 节点也自动同步进来。节点发现不能依赖 Metrics Server：
        // 新集群可能尚未部署 metrics.k8s.io，但 kubectl get nodes 已经可用。
        for (String name : discoveredNodeNames(
                capacities, osInfo, nodeLabels, topMetrics)) {
            if (!ipMap.containsKey(name)) {
                double[] cap = capacities.get(name);
                String osImage = osInfo.get(name);
                String labelsJson = nodeLabels.get(name);
                autoRegisterK8sNode(name, cap, osImage, labelsJson);
            }
        }

        cleanupHistory();
    }

    static Set<String> discoveredNodeNames(
            Map<String, double[]> capacities,
            Map<String, String> osInfo,
            Map<String, String> nodeLabels,
            Map<String, TopData> topMetrics
    ) {
        Set<String> names = new LinkedHashSet<>();
        if (capacities != null) names.addAll(capacities.keySet());
        if (osInfo != null) names.addAll(osInfo.keySet());
        if (nodeLabels != null) names.addAll(nodeLabels.keySet());
        if (topMetrics != null) names.addAll(topMetrics.keySet());
        names.removeIf(name -> name == null || name.isBlank());
        return names;
    }

    void collectOne(ComputeServer server, TopData top, double[] capacity) {
        Optional<ServerMetricSnapshot> existingSnapshot = snapshotRepo.findByServerIp(server.getServerIp());
        if (top == null && existingSnapshot.isEmpty()) {
            // A missing first sample is not a real zero. Leave the snapshot absent so the API reports unavailable.
            return;
        }
        ServerMetricSnapshot snap = existingSnapshot
                .orElseGet(() -> {
                    ServerMetricSnapshot s = new ServerMetricSnapshot();
                    s.setServerIp(server.getServerIp());
                    return s;
                });

        Instant now = Instant.now();

        if (top != null) {
            // 用绝对值除总容量算百分比
            if (capacity != null) {
                double cpuCores = capacity[0] > 0 ? capacity[0] : (server.getCpuCores() != null ? server.getCpuCores() : 0);
                double memGiB = capacity[1] > 0 ? capacity[1] : (server.getMemoryGib() != null ? server.getMemoryGib() : 0);
                snap.setCpuRate(cpuCores > 0 ? Math.round(top.cpuUsed * 1000.0 / cpuCores) / 10.0 : top.cpuPct);
                snap.setMemRate(memGiB > 0 ? Math.round(top.memBytes * 1000.0 / (memGiB * 1024 * 1024 * 1024)) / 10.0 : top.memPct);
            } else {
                snap.setCpuRate(top.cpuPct);
                snap.setMemRate(top.memPct);
            }
        }

        // 磁盘 / 网络：从 kubelet stats summary 接口采集
        NodeStats nodeStats = collectNodeStats(
                server.getK8sNodeName() != null ? server.getK8sNodeName() : server.getServerIp(),
                server.getServerIp());
        if (nodeStats != null) {
            // Zero is a valid successful sample. Do not preserve an old non-zero value in that case.
            snap.setDiskRate(nodeStats.diskRate());
            snap.setNetworkIn(nodeStats.networkRxRate());
            snap.setNetworkOut(nodeStats.networkTxRate());
        }
        // 首次采集或采集失败时，保留已有值；仅在全新快照时设默认 0
        if (snap.getDiskRate() == null) snap.setDiskRate(0.0);
        if (snap.getNetworkIn() == null) snap.setNetworkIn(0.0);
        if (snap.getNetworkOut() == null) snap.setNetworkOut(0.0);

        // GPU：仅新快照设默认 0，已有数据保留上次的值
        if (snap.getGpuRate() == null) snap.setGpuRate(0.0);
        if (snap.getGpuMemRate() == null) snap.setGpuMemRate(0.0);
        if (snap.getGpuTemp() == null) snap.setGpuTemp(0.0);

        // GPU metrics from DCGM exporter (overwrites defaults if available)
        String specGpu = server.getSpecGpu();
        if (specGpu != null && !specGpu.isEmpty()) {
            collectGpu(server.getServerIp(), snap);
        }
        // Also try DCGM if the node has GPU capacity but no spec string
        if ((specGpu == null || specGpu.isEmpty()) && server.getGpuCount() != null && server.getGpuCount() > 0) {
            collectGpu(server.getServerIp(), snap);
        }

        // lastHeartbeat means the last successful core Metrics API sample. updatedAt is the latest attempt.
        // Their difference lets the API distinguish stale/unavailable data without a schema change.
        if (top != null) {
            double maxRate = Math.max(
                    Math.max(Math.max(snap.getCpuRate(), snap.getMemRate()), snap.getGpuRate()),
                    snap.getDiskRate()
            );
            snap.setStatus(maxRate >= 85.0 ? "warning" : "online");
            snap.setLastHeartbeat(now);
        } else {
            snap.setStatus("warning");
        }
        snap.setUpdatedAt(now);
        snapshotRepo.save(snap);

        if (top == null) {
            // Do not create a fresh chart point from preserved CPU/memory values.
            return;
        }

        // history — networkIn/Out store cumulative bytes for the next delta calculation, not rates.
        ServerMetricHistory hist = new ServerMetricHistory();
        hist.setServerIp(server.getServerIp());
        hist.setCpuRate(snap.getCpuRate());
        hist.setMemRate(snap.getMemRate());
        hist.setGpuRate(snap.getGpuRate());
        hist.setGpuMemRate(snap.getGpuMemRate());
        hist.setDiskRate(snap.getDiskRate());
        hist.setNetworkIn(nodeStats != null ? (double) nodeStats.rawRxBytes() : 0.0);
        hist.setNetworkOut(nodeStats != null ? (double) nodeStats.rawTxBytes() : 0.0);
        hist.setGpuTemp(snap.getGpuTemp());
        hist.setCollectedAt(now);
        historyRepo.save(hist);
    }

    private void autoRegisterK8sNode(String name, double[] capacity, String osImage, String labelsJson) {
        ComputeServer s = new ComputeServer();
        s.setServerIp(name);
        s.setHostname(name);
        s.setStatus("online");
        s.setK8sNodeName(name);
        s.setDeleted(false);
        if (capacity != null) {
            s.setCpuCores(capacity[0] > 0 ? capacity[0] : null);
            s.setMemoryGib(capacity[1] > 0 ? capacity[1] : null);
            if (capacity.length > 2 && capacity[2] > 0) {
                s.setGpuCount((int) capacity[2]);
            }
        }
        // 从 K8s 节点信息获取 OS，format: "Ubuntu 22.04.5 LTS"
        if (osImage != null && !osImage.isEmpty()) {
            s.setSpecOs(osImage.length() > 64 ? osImage.substring(0, 64) : osImage);
        }
        // 节点标签（tss.ai/node-pool 等），供调度器按 nodeSelector 过滤节点
        if (labelsJson != null && !labelsJson.isBlank()) {
            s.setK8sLabelsJson(labelsJson);
        }
        s.setCreatedAt(Instant.now());
        s.setUpdatedAt(Instant.now());
        serverRepo.save(s);
        LOG.info("自动注册K8s节点: {} (GPU={}, OS={}, labels={})",
                name, s.getGpuCount(), s.getSpecOs(), labelsJson != null ? "yes" : "no");
    }

    /** 从 kubectl get nodes -o json 获取每个节点的 CPU 总核数、内存总量(GiB)、GPU 数量和 OS 信息 */
    Map<String, String> fetchNodeLabelsJson() {
        Map<String, String> labelsByNode = new LinkedHashMap<>();
        try {
            Path kubeconfig = envService.resolveKubeconfig();
            List<String> cmd = envService.kubectlCommand(kubeconfig, "get", "nodes", "-o", "json");
            ShellCommandRunner.CommandResult result =
                    shellRunner.run(cmd, envService.resolveProjectRoot(), 30);
            if (!result.success()) {
                return labelsByNode;
            }
            JsonNode root = objectMapper.readTree(result.output());
            for (JsonNode item : root.path("items")) {
                String name = item.path("metadata").path("name").asText();
                JsonNode labels = item.path("metadata").path("labels");
                // 空标签节点不写入：保持 k8s_labels_json 为 null，matchesNodeSelector 对空标签视为匹配全部，
                // 避免把无标签节点写成 "{}" 后对所有 nodeSelector 都不匹配、导致该节点一个任务都分不到
                if (!name.isBlank() && labels.isObject() && !labels.isEmpty()) {
                    labelsByNode.put(name, objectMapper.writeValueAsString(labels));
                }
            }
        } catch (Exception exception) {
            LOG.warn("Failed to fetch Kubernetes node labels: {}", exception.getMessage());
        }
        return labelsByNode;
    }

    void syncNodeLabels(List<ComputeServer> servers, Map<String, String> labelsByNode) {
        if (labelsByNode == null || labelsByNode.isEmpty()) {
            return;
        }
        for (ComputeServer server : servers) {
            String nodeName = server.getK8sNodeName();
            if (nodeName == null || nodeName.isBlank()) {
                nodeName = server.getServerIp();
            }
            String labelsJson = labelsByNode.get(nodeName);
            if (labelsJson != null && !Objects.equals(labelsJson, server.getK8sLabelsJson())) {
                server.setK8sLabelsJson(labelsJson);
                server.setUpdatedAt(Instant.now());
                serverRepo.save(server);
            }
        }
    }

    Map<String, double[]> fetchNodeCapacities() {
        Map<String, double[]> caps = new LinkedHashMap<>();
        try {
            Path kubectl = envService.resolveKubectl();
            Path kubeconfig = envService.resolveKubeconfig();
            List<String> cmd = envService.kubectlCommand(kubeconfig, "get", "nodes", "-o", "json");
            ShellCommandRunner.CommandResult r = shellRunner.run(cmd, envService.resolveProjectRoot(), 30);
            if (r.success()) {
                JsonNode root = objectMapper.readTree(r.output());
                for (JsonNode item : root.path("items")) {
                    String name = item.path("metadata").path("name").asText();
                    try {
                        JsonNode cap = item.path("status").path("capacity");
                        double cpu = parseCpu(cap.path("cpu").asText());
                        double memGiB = parseMemToBytes(cap.path("memory").asText()) / (1024.0 * 1024.0 * 1024.0);
                        // GPU count from nvidia.com/gpu capacity
                        double gpuCount = 0;
                        String gpuStr = cap.path("nvidia.com/gpu").asText();
                        if (!gpuStr.isEmpty()) {
                            try { gpuCount = Double.parseDouble(gpuStr); } catch (NumberFormatException ignored) {}
                        }
                        // 磁盘总容量 from ephemeral-storage capacity (GiB)
                        double diskCapacityGiB = 0;
                        String diskCapStr = cap.path("ephemeral-storage").asText();
                        if (!diskCapStr.isEmpty()) {
                            diskCapacityGiB = parseMemToBytes(diskCapStr) / (1024.0 * 1024.0 * 1024.0);
                        }
                        caps.put(name, new double[]{cpu, memGiB, gpuCount, diskCapacityGiB});
                    } catch (RuntimeException exception) {
                        LOG.warn("忽略无效节点容量 node={}: {}", name, exception.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            LOG.warn("获取节点容量失败: {}", e.getMessage());
        }
        return caps;
    }

    /** 从 kubectl get nodes -o json 获取每个节点的 OS 镜像信息 */
    Map<String, String> fetchNodeOsInfo() {
        Map<String, String> osMap = new LinkedHashMap<>();
        try {
            Path kubectl = envService.resolveKubectl();
            Path kubeconfig = envService.resolveKubeconfig();
            List<String> cmd = envService.kubectlCommand(kubeconfig, "get", "nodes", "-o", "json");
            ShellCommandRunner.CommandResult r = shellRunner.run(cmd, envService.resolveProjectRoot(), 30);
            if (r.success()) {
                JsonNode root = objectMapper.readTree(r.output());
                for (JsonNode item : root.path("items")) {
                    String name = item.path("metadata").path("name").asText();
                    String osImage = item.path("status").path("nodeInfo").path("osImage").asText();
                    if (!osImage.isEmpty()) {
                        osMap.put(name, osImage);
                    }
                }
            }
        } catch (Exception e) {
            LOG.warn("获取节点OS信息失败: {}", e.getMessage());
        }
        return osMap;
    }

    // ── top / GPU ──

    private boolean isK8sReady() {
        try {
            Path kubectl = envService.resolveKubectl();
            Path kubeconfig = envService.resolveKubeconfig();
            List<String> cmd = envService.kubectlCommand(kubeconfig, "get", "nodes");
            return shellRunner.run(cmd, envService.resolveProjectRoot(), 10).success();
        } catch (Exception e) { return false; }
    }

    Map<String, TopData> collectTop() {
        Map<String, TopData> result = new LinkedHashMap<>();
        try {
            Path kubeconfig = envService.resolveKubeconfig();
            List<String> rawCmd = envService.kubectlCommand(kubeconfig,
                    "get", "--raw", "/apis/metrics.k8s.io/v1beta1/nodes");
            ShellCommandRunner.CommandResult r = shellRunner.run(rawCmd, envService.resolveProjectRoot(), 30);
            if (r.success()) {
                JsonNode root = objectMapper.readTree(r.output());
                for (JsonNode item : root.path("items")) {
                    String name = item.path("metadata").path("name").asText();
                    try {
                        JsonNode usage = item.path("usage");
                        String cpuS = usage.path("cpu").asText();
                        String memS = usage.path("memory").asText();
                        double cpuUsed = parseCpu(cpuS);
                        long memBytes = parseMemToBytes(memS);
                        // ephemeral-storage usage (may not exist on all clusters)
                        String diskS = usage.path("ephemeral-storage").asText();
                        long diskBytes = diskS.isEmpty() ? 0 : parseMemToBytes(diskS);
                        result.put(name, new TopData(cpuUsed, memBytes, 0, 0, diskBytes));
                    } catch (RuntimeException exception) {
                        LOG.warn("忽略无效节点指标 node={}: {}", name, exception.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            LOG.warn("Metrics API failed: {}", e.getMessage());
        }

        if (result.isEmpty()) {
            // fallback: kubectl top nodes
            try {
                Path kubeconfig = envService.resolveKubeconfig();
                List<String> cmd = envService.kubectlCommand(kubeconfig, "top", "nodes");
                ShellCommandRunner.CommandResult r = shellRunner.run(cmd, envService.resolveProjectRoot(), 30);
                if (r.success()) {
                    for (String line : r.output().split("\n")) {
                        Matcher m = TOP_LINE.matcher(line.trim());
                        if (m.matches()) {
                            String name = m.group(1);
                            try {
                                double cpu = parseCpu(m.group(2));
                                // % from group(3)
                                double cpuPct = parsePct(m.group(3));
                                long mem = parseMemToBytes(m.group(4));
                                double memPct = parsePct(m.group(5));
                                result.put(name, new TopData(cpu, mem, cpuPct, memPct, 0));
                            } catch (RuntimeException exception) {
                                LOG.warn("忽略无效 top 指标 node={}: {}", name, exception.getMessage());
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        return result;
    }

    private void collectGpu(String ip, ServerMetricSnapshot snap) {
        try {
            String url = "http://" + ip + ":" + properties.getDcgmExporterPort() + "/metrics";
            HttpRequest req = HttpRequest.newBuilder().uri(URI.create(url)).timeout(Duration.ofSeconds(5)).GET().build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                double totalUtil = 0, totalMem = 0, totalMemCap = 0;
                int count = 0;
                for (String line : resp.body().split("\n")) {
                    line = line.trim();
                    if (line.isEmpty() || line.startsWith("#")) continue;
                    // DCGM_FI_DEV_GPU_UTIL{gpu="0"} 65
                    if (line.contains("DCGM_FI_DEV_GPU_UTIL{")) {
                        totalUtil += extractValue(line);
                        count++;
                    } else if (line.contains("DCGM_FI_DEV_FB_USED{")) {
                        totalMem += extractValue(line) * 1024 * 1024; // MiB -> bytes
                    } else if (line.contains("DCGM_FI_DEV_FB_TOTAL{")) {
                        totalMemCap += extractValue(line) * 1024 * 1024;
                    }
                }
                if (count > 0) {
                    snap.setGpuRate(Math.round(totalUtil * 10.0 / count) / 10.0);
                    if (totalMemCap > 0) {
                        snap.setGpuMemRate(Math.round(totalMem * 1000.0 / totalMemCap) / 10.0);
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    /** 通过 kubelet stats summary API 采集节点磁盘和网络指标 */
    private NodeStats collectNodeStats(String nodeName, String serverIp) {
        try {
            Path kubectl = envService.resolveKubectl();
            Path kubeconfig = envService.resolveKubeconfig();
            String path = "/api/v1/nodes/" + nodeName + "/proxy/stats/summary";
            List<String> cmd = envService.kubectlCommand(kubeconfig, "get", "--raw", path);
            ShellCommandRunner.CommandResult r = shellRunner.run(cmd, envService.resolveProjectRoot(), 15);
            if (!r.success()) {
                LOG.warn("kubelet stats 命令失败 node={}, exit={}, err={}", nodeName, r.exitCode(), r.errorMessage());
                return null;
            }
            if (r.output().isBlank()) {
                LOG.warn("kubelet stats 返回空 node={}", nodeName);
                return null;
            }

            JsonNode root = objectMapper.readTree(r.output());
            JsonNode nodeStats = root.path("node");
            if (nodeStats.isMissingNode()) {
                LOG.warn("kubelet stats 缺少 node 字段 node={}, 开头100字符: {}", nodeName,
                        r.output().length() > 100 ? r.output().substring(0, 100) : r.output());
                return null;
            }

            // 磁盘：fs used / capacity → 百分比
            JsonNode fs = nodeStats.path("fs");
            long fsUsed = fs.path("usedBytes").asLong(0);
            long fsCapacity = fs.path("capacityBytes").asLong(0);
            double diskRate = fsCapacity > 0
                    ? Math.round(fsUsed * 1000.0 / fsCapacity) / 10.0 : 0;

            // 网络：累计字节 → 计算速率
            JsonNode net = nodeStats.path("network");
            long rxBytes = net.path("rxBytes").asLong(0);
            long txBytes = net.path("txBytes").asLong(0);
            double rxRate = 0, txRate = 0;

            if (rxBytes > 0 || txBytes > 0) {
                Instant now = Instant.now();
                ServerMetricHistory prev = historyRepo.findFirstByServerIpOrderByCollectedAtDesc(serverIp);
                if (prev != null && prev.getCollectedAt() != null) {
                    // history 中 networkIn/Out 存的是上次的累计字节。
                    long prevRx = (long)(prev.getNetworkIn() != null ? prev.getNetworkIn() : 0);
                    long prevTx = (long)(prev.getNetworkOut() != null ? prev.getNetworkOut() : 0);
                    double elapsedSec = Math.max(1,
                            (now.toEpochMilli() - prev.getCollectedAt().toEpochMilli()) / 1000.0);
                    rxRate = networkRate(rxBytes, prevRx, elapsedSec);
                    txRate = networkRate(txBytes, prevTx, elapsedSec);
                }
            }

            LOG.info("kubelet stats 采集成功 node={}, disk={}%, rx={}MB/s, tx={}MB/s",
                    nodeName, diskRate, rxRate, txRate);
            return new NodeStats(diskRate, rxRate, txRate,
                    rxBytes, txBytes);
        } catch (Exception e) {
            LOG.warn("kubelet stats 采集异常 node={}: {}", nodeName, e.getMessage());
            return null;
        }
    }

    private double extractValue(String line) {
        int lastSpace = line.lastIndexOf(' ');
        if (lastSpace < 0) return 0;
        try { return Double.parseDouble(line.substring(lastSpace + 1).trim()); }
        catch (NumberFormatException e) { return 0; }
    }

    void cleanupHistory() {
        Instant cutoff = Instant.now().minus(Duration.ofDays(properties.getMetricsRetentionDays()));
        int n = historyRepo.deleteByCollectedAtBefore(cutoff);
        if (n > 0) LOG.info("清理过期指标: {} 条", n);
    }

    // ── parsing ──
    static double parseCpu(String s) {
        return KubernetesQuantityParser.cpuCores(s);
    }

    static long parseMemToBytes(String s) {
        return KubernetesQuantityParser.memoryBytes(s);
    }

    static double networkRate(long currentBytes, long previousBytes, double elapsedSeconds) {
        if (currentBytes <= previousBytes || previousBytes <= 0 || elapsedSeconds <= 0) {
            return 0;
        }
        // Versions before G1 stored MiB in this column. Skip one transition sample instead of
        // reporting a huge false spike; the current full-byte value is persisted for the next run.
        if (previousBytes < currentBytes / 1024L) {
            return 0;
        }
        return Math.round((currentBytes - previousBytes) * 10.0
                / (1024 * 1024 * elapsedSeconds)) / 10.0;
    }

    static double parsePct(String s) {
        if (s == null || s.isEmpty()) return 0;
        return Double.parseDouble(s.replace("%", "").trim());
    }

    record TopData(double cpuUsed, long memBytes, double cpuPct, double memPct, long diskBytes) {}

    record NodeStats(double diskRate, double networkRxRate, double networkTxRate,
                     long rawRxBytes, long rawTxBytes) {}
}
