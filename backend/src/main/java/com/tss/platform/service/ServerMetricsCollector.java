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

        // 获取各节点容量（CPU/内存/GPU）和 OS 信息
        Map<String, double[]> capacities = fetchNodeCapacities();
        Map<String, String> osInfo = fetchNodeOsInfo();

        Map<String, TopData> topMetrics = collectTop();
        List<ComputeServer> servers = serverRepo.findByDeletedFalse();
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

        // 把 K8s 节点也自动同步进来
        for (String name : topMetrics.keySet()) {
            if (!ipMap.containsKey(name)) {
                double[] cap = capacities.get(name);
                String osImage = osInfo.get(name);
                autoRegisterK8sNode(name, cap, osImage);
            }
        }

        cleanupHistory();
    }

    private void collectOne(ComputeServer server, TopData top, double[] capacity) {
        ServerMetricSnapshot snap = snapshotRepo.findByServerIp(server.getServerIp())
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
        } else {
            snap.setCpuRate(0.0);
            snap.setMemRate(0.0);
        }

        // 磁盘 / 网络：从 kubelet stats summary 接口采集
        NodeStats nodeStats = collectNodeStats(
                server.getK8sNodeName() != null ? server.getK8sNodeName() : server.getServerIp(),
                server.getServerIp());
        if (nodeStats != null) {
            if (nodeStats.diskRate() > 0) snap.setDiskRate(nodeStats.diskRate());
            if (nodeStats.networkRxRate() > 0) snap.setNetworkIn(nodeStats.networkRxRate());
            if (nodeStats.networkTxRate() > 0) snap.setNetworkOut(nodeStats.networkTxRate());
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

        // status calc
        double maxRate = Math.max(Math.max(snap.getCpuRate(), snap.getMemRate()), snap.getGpuRate());
        snap.setStatus(maxRate >= 85.0 ? "warning" : "online");
        snap.setLastHeartbeat(now);
        snap.setUpdatedAt(now);
        snapshotRepo.save(snap);

        // history — 注意：networkIn/Out 存累计字节(MB)，供下次增量计算，不是速率
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

    private void autoRegisterK8sNode(String name, double[] capacity, String osImage) {
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
        s.setCreatedAt(Instant.now());
        s.setUpdatedAt(Instant.now());
        serverRepo.save(s);
        LOG.info("自动注册K8s节点: {} (GPU={}, OS={})", name, s.getGpuCount(), s.getSpecOs());
    }

    /** 从 kubectl get nodes -o json 获取每个节点的 CPU 总核数、内存总量(GiB)、GPU 数量和 OS 信息 */
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
                    JsonNode usage = item.path("usage");
                    String cpuS = usage.path("cpu").asText();
                    String memS = usage.path("memory").asText();
                    double cpuUsed = parseCpu(cpuS);
                    long memBytes = parseMemToBytes(memS);
                    // ephemeral-storage usage (may not exist on all clusters)
                    String diskS = usage.path("ephemeral-storage").asText();
                    long diskBytes = diskS.isEmpty() ? 0 : parseMemToBytes(diskS);
                    result.put(name, new TopData(cpuUsed, memBytes, 0, 0, diskBytes));
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
                            double cpu = parseCpu(m.group(2));
                            // % from group(3)
                            double cpuPct = parsePct(m.group(3));
                            long mem = parseMemToBytes(m.group(4));
                            double memPct = parsePct(m.group(5));
                            result.put(name, new TopData(cpu, mem, cpuPct, memPct, 0));
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
            if (!r.success() || r.output().isBlank()) return null;

            JsonNode root = objectMapper.readTree(r.output());
            JsonNode nodeStats = root.path("node");

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
                    // history 中 networkIn/Out 存的是上次的累计字节（MB）
                    long prevRx = (long)(prev.getNetworkIn() != null ? prev.getNetworkIn() : 0);
                    long prevTx = (long)(prev.getNetworkOut() != null ? prev.getNetworkOut() : 0);
                    double elapsedSec = Math.max(1,
                            (now.toEpochMilli() - prev.getCollectedAt().toEpochMilli()) / 1000.0);
                    if (prevRx > 0 && rxBytes > prevRx) {
                        rxRate = Math.round((rxBytes - prevRx) * 10.0 / (1024 * 1024 * elapsedSec)) / 10.0;
                    }
                    if (prevTx > 0 && txBytes > prevTx) {
                        txRate = Math.round((txBytes - prevTx) * 10.0 / (1024 * 1024 * elapsedSec)) / 10.0;
                    }
                }
            }

            return new NodeStats(diskRate, rxRate, txRate,
                    rxBytes / (1024 * 1024), txBytes / (1024 * 1024));  // 累计字节转为 MB 存储
        } catch (Exception e) {
            LOG.debug("kubelet stats 采集失败 node={}: {}", nodeName, e.getMessage());
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
        if (s == null || s.isEmpty()) return 0;
        s = s.trim();
        if (s.endsWith("m")) return Double.parseDouble(s.replace("m", "")) / 1000.0;
        if (s.endsWith("n")) return Double.parseDouble(s.replace("n", "")) / 1_000_000_000.0;
        return Double.parseDouble(s);
    }

    static long parseMemToBytes(String s) {
        if (s == null || s.isEmpty()) return 0;
        s = s.trim();
        if (s.endsWith("Ki")) return (long)(Double.parseDouble(s.replace("Ki","")) * 1024);
        if (s.endsWith("Mi")) return (long)(Double.parseDouble(s.replace("Mi","")) * 1024 * 1024);
        if (s.endsWith("Gi")) return (long)(Double.parseDouble(s.replace("Gi","")) * 1024 * 1024 * 1024);
        return Long.parseLong(s);
    }

    static double parsePct(String s) {
        if (s == null || s.isEmpty()) return 0;
        return Double.parseDouble(s.replace("%", "").trim());
    }

    record TopData(double cpuUsed, long memBytes, double cpuPct, double memPct, long diskBytes) {}

    record NodeStats(double diskRate, double networkRxRate, double networkTxRate,
                     long rawRxBytes, long rawTxBytes) {}
}
