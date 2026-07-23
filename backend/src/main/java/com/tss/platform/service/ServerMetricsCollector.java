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

    @Scheduled(fixedDelayString = "${resource-monitor.metrics.collect-interval-ms:30000}")
    public void collectMetrics() {
        if (!isK8sReady()) return;

        Map<String, TopData> topMetrics = collectTop();
        List<ComputeServer> servers = serverRepo.findByDeletedFalse();
        Map<String, ComputeServer> ipMap = new LinkedHashMap<>();
        for (ComputeServer s : servers) {
            ipMap.put(s.getServerIp(), s);
        }

        for (ComputeServer server : servers) {
            try {
                collectOne(server, topMetrics.get(server.getServerIp()));
            } catch (Exception e) {
                LOG.debug("采集 {} 失败: {}", server.getServerIp(), e.getMessage());
            }
        }

        // 把 K8s 节点也自动同步进来
        for (String ip : topMetrics.keySet()) {
            if (!ipMap.containsKey(ip)) {
                autoRegisterK8sNode(ip);
            }
        }

        cleanupHistory();
    }

    private void collectOne(ComputeServer server, TopData top) {
        ServerMetricSnapshot snap = snapshotRepo.findByServerIp(server.getServerIp())
                .orElseGet(() -> {
                    ServerMetricSnapshot s = new ServerMetricSnapshot();
                    s.setServerIp(server.getServerIp());
                    return s;
                });

        Instant now = Instant.now();

        if (top != null) {
            snap.setCpuRate(top.cpuPct);
            snap.setMemRate(top.memPct);
        } else {
            snap.setCpuRate(0.0);
            snap.setMemRate(0.0);
        }

        // GPU from DCGM
        snap.setGpuRate(0.0);
        snap.setGpuMemRate(0.0);
        snap.setGpuTemp(0.0);
        snap.setNetworkIn(0.0);
        snap.setNetworkOut(0.0);
        snap.setDiskRate(0.0);

        String specGpu = server.getSpecGpu();
        if (specGpu != null && !specGpu.isEmpty()) {
            collectGpu(server.getServerIp(), snap);
        }

        // status calc
        double maxRate = Math.max(Math.max(snap.getCpuRate(), snap.getMemRate()), snap.getGpuRate());
        snap.setStatus(maxRate >= 85.0 ? "warning" : "online");
        snap.setLastHeartbeat(now);
        snap.setUpdatedAt(now);
        snapshotRepo.save(snap);

        // history
        ServerMetricHistory hist = new ServerMetricHistory();
        hist.setServerIp(server.getServerIp());
        hist.setCpuRate(snap.getCpuRate());
        hist.setMemRate(snap.getMemRate());
        hist.setGpuRate(snap.getGpuRate());
        hist.setGpuMemRate(snap.getGpuMemRate());
        hist.setDiskRate(snap.getDiskRate());
        hist.setNetworkIn(snap.getNetworkIn());
        hist.setNetworkOut(snap.getNetworkOut());
        hist.setGpuTemp(snap.getGpuTemp());
        hist.setCollectedAt(now);
        historyRepo.save(hist);
    }

    private void autoRegisterK8sNode(String ip) {
        ComputeServer s = new ComputeServer();
        s.setServerIp(ip);
        s.setHostname(ip);
        s.setStatus("online");
        s.setK8sNodeName(ip);
        s.setDeleted(false);
        s.setCreatedAt(Instant.now());
        s.setUpdatedAt(Instant.now());
        serverRepo.save(s);
        LOG.info("自动注册K8s节点: {}", ip);
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
                    // get node capacity for %
                    double cpuPct = 0, memPct = 0;
                    // we store absolute values, pct computed at snapshot
                    result.put(name, new TopData(cpuUsed, memBytes, 0, 0));
                }
            }
        } catch (Exception e) {
            LOG.debug("Metrics API failed: {}", e.getMessage());
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
                            result.put(name, new TopData(cpu, mem, cpuPct, memPct));
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

    record TopData(double cpuUsed, long memBytes, double cpuPct, double memPct) {}
}
