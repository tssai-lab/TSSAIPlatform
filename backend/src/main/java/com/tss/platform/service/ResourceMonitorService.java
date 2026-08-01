package com.tss.platform.service;

import com.tss.platform.dto.resource.*;
import com.tss.platform.entity.*;
import com.tss.platform.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.InetAddress;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ResourceMonitorService {

    private static final Logger LOG = LoggerFactory.getLogger(ResourceMonitorService.class);
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.of("Asia/Shanghai"));
    private static final Set<String> PRIORITY_VALUES = Set.of("高", "中", "低");
    private static final Map<String, Integer> PRIORITY_ORDER = Map.of("高", 3, "中", 2, "低", 1);

    private final ComputeServerRepository serverRepo;
    private final ServerMetricSnapshotRepository snapshotRepo;
    private final ServerMetricHistoryRepository historyRepo;
    private final TrainingExperimentVersionRepository trainingRepo;
    private final InferenceTaskRepository inferenceRepo;

    public ResourceMonitorService(
            ComputeServerRepository serverRepo,
            ServerMetricSnapshotRepository snapshotRepo,
            ServerMetricHistoryRepository historyRepo,
            TrainingExperimentVersionRepository trainingRepo,
            InferenceTaskRepository inferenceRepo) {
        this.serverRepo = serverRepo;
        this.snapshotRepo = snapshotRepo;
        this.historyRepo = historyRepo;
        this.trainingRepo = trainingRepo;
        this.inferenceRepo = inferenceRepo;
    }

    // ────────── 5.1 SUMMARY ──────────

    public SummaryDto getSummary() {
        List<ComputeServer> servers = serverRepo.findByDeletedFalse();
        List<ServerMetricSnapshot> snapshots = snapshotRepo.findAll();

        Map<String, ServerMetricSnapshot> snapMap = snapshots.stream()
                .collect(Collectors.toMap(ServerMetricSnapshot::getServerIp, s -> s));

        int online = 0;
        double totalGpuRate = 0;
        int gpuCount = 0;
        int runningTasks = 0;
        int queuedTasks = 0;

        for (ComputeServer s : servers) {
            ServerMetricSnapshot snap = snapMap.get(s.getServerIp());
            if (snap != null && "online".equals(snap.getStatus())) {
                online++;
            }
            if (snap != null && snap.getGpuRate() != null) {
                totalGpuRate += snap.getGpuRate();
                gpuCount++;
            }
        }

        // 汇总所有服务器上的任务数
        List<TrainingExperimentVersion> trainingTasks = trainingRepo
                .findByServerIpNotNullAndStatusIn(List.of("running", "queued"));
        List<InferenceTask> inferenceTasks = inferenceRepo
                .findByServerIpNotNullAndStatusIn(List.of("running", "queued"));

        for (TrainingExperimentVersion t : trainingTasks) {
            if ("running".equals(t.getStatus())) runningTasks++;
            else if ("queued".equals(t.getStatus())) queuedTasks++;
        }
        for (InferenceTask t : inferenceTasks) {
            if ("running".equals(t.getStatus())) runningTasks++;
            else if ("queued".equals(t.getStatus())) queuedTasks++;
        }

        SummaryDto dto = new SummaryDto();
        dto.setTotal(servers.size());
        dto.setOnline(online);
        dto.setRunningTasks(runningTasks);
        dto.setQueuedTasks(queuedTasks);
        dto.setAvgGpu(gpuCount > 0 ? String.format("%.1f", totalGpuRate / gpuCount) : "0");
        return dto;
    }

    // ────────── 5.2 SERVERS LIST ──────────

    public List<ServerItem> listServers(String keyword, String status) {
        List<ComputeServer> servers = serverRepo.findByDeletedFalse();
        List<ServerMetricSnapshot> snapshots = snapshotRepo.findAll();
        Map<String, ServerMetricSnapshot> snapMap = snapshots.stream()
                .collect(Collectors.toMap(ServerMetricSnapshot::getServerIp, s -> s));

        return servers.stream()
                .filter(s -> keyword == null || keyword.isEmpty()
                        || s.getHostname().contains(keyword) || s.getServerIp().contains(keyword))
                .map(s -> toServerItem(s, snapMap.get(s.getServerIp()), false))
                .filter(item -> status == null || "all".equals(status) || item.getStatus().equals(status))
                .collect(Collectors.toList());
    }

    // ────────── 5.3 ADD SERVER ──────────

    @Transactional
    public ServerItem addServer(AddServerRequest req) {
        String ip = req.getServerIp();
        if (ip == null || ip.isEmpty()) {
            throw new IllegalArgumentException("请输入合法的 IP 地址");
        }
        if (!isValidIp(ip)) {
            throw new IllegalArgumentException("请输入合法的 IP 地址");
        }
        if (serverRepo.existsByServerIpAndDeletedFalse(ip)) {
            throw new IllegalArgumentException("该 IP 已存在");
        }

        ComputeServer server = new ComputeServer();
        server.setServerIp(ip);
        server.setHostname(req.getHostname() != null ? req.getHostname() : ip);
        server.setStatus("online");
        server.setDeleted(false);
        server.setCreatedAt(Instant.now());
        server.setUpdatedAt(Instant.now());

        if (req.getSpecs() != null) {
            server.setSpecCpu(req.getSpecs().getCpu());
            server.setSpecMemory(req.getSpecs().getMemory());
            server.setSpecGpu(req.getSpecs().getGpu());
            server.setSpecOs(req.getSpecs().getOs() != null ? req.getSpecs().getOs() : "Ubuntu 22.04");
        }

        serverRepo.save(server);
        LOG.info("服务器已添加: {} ({})", ip, server.getHostname());
        return toServerItem(server, null, false);
    }

    // ────────── 5.4 SERVER DETAIL ──────────

    public ServerItem getServerDetail(String serverIp) {
        ComputeServer server = serverRepo.findByServerIpAndDeletedFalse(serverIp)
                .orElseThrow(() -> new IllegalArgumentException("服务器不存在: " + serverIp));
        ServerMetricSnapshot snapshot = snapshotRepo.findByServerIp(serverIp).orElse(null);
        return toServerItem(server, snapshot, true);
    }

    // ────────── 5.5 DELETE SERVER ──────────

    @Transactional
    public void deleteServer(String serverIp) {
        ComputeServer server = serverRepo.findByServerIpAndDeletedFalse(serverIp)
                .orElse(null);
        if (server == null) {
            throw new IllegalArgumentException("服务器不存在: " + serverIp);
        }

        // 检查是否有运行中任务
        List<TrainingExperimentVersion> runningTraining = trainingRepo
                .findByServerIpAndStatus(serverIp, "running");
        List<InferenceTask> runningInference = inferenceRepo
                .findByServerIpAndStatus(serverIp, "running");

        if (!runningTraining.isEmpty() || !runningInference.isEmpty()) {
            throw new IllegalArgumentException("该服务器仍有运行中任务，无法删除");
        }

        // 清空该节点排队任务
        cancelQueuedTasksOnServer(serverIp);

        // 软删除
        server.setDeleted(true);
        server.setUpdatedAt(Instant.now());
        serverRepo.save(server);
        LOG.info("服务器已删除: {}", serverIp);
    }

    // ────────── 5.6 METRICS ──────────

    public MetricsResponse getMetrics(String serverIp, String interval) {
        if (interval == null || interval.isEmpty()) {
            interval = "1hour";
        }

        // 计算时间范围
        Duration duration;
        String spanLabel;
        int maxPoints;
        switch (interval) {
            case "1min":
                duration = Duration.ofHours(1);
                spanLabel = "近 1 小时（按分钟）";
                maxPoints = 60;
                break;
            case "10min":
                duration = Duration.ofHours(12);
                spanLabel = "近 12 小时（按10分钟）";
                maxPoints = 72;
                break;
            case "1hour":
                duration = Duration.ofHours(24);
                spanLabel = "近 24 小时（按小时）";
                maxPoints = 24;
                break;
            case "1day":
                duration = Duration.ofDays(30);
                spanLabel = "近 30 天（按天）";
                maxPoints = 30;
                break;
            default:
                duration = Duration.ofHours(24);
                spanLabel = "近 24 小时（按小时）";
                maxPoints = 24;
        }

        Instant to = Instant.now();
        Instant from = to.minus(duration);
        List<ServerMetricHistory> history = historyRepo
                .findByServerIpAndCollectedAtBetweenOrderByCollectedAtAsc(
                        serverIp, from, to, PageRequest.of(0, maxPoints * 10));

        // 按时间桶聚合
        long bucketMs = duration.toMillis() / maxPoints;
        List<MetricPoint> points = new ArrayList<>();

        for (int i = 0; i < maxPoints; i++) {
            long bucketStart = to.toEpochMilli() - (maxPoints - i) * bucketMs;
            long bucketEnd = to.toEpochMilli() - (maxPoints - i - 1) * bucketMs;

            List<ServerMetricHistory> bucket = history.stream()
                    .filter(h -> {
                        long ts = h.getCollectedAt().toEpochMilli();
                        return ts >= bucketStart && ts < bucketEnd;
                    }).toList();

            Instant tickTime = Instant.ofEpochMilli((bucketStart + bucketEnd) / 2);
            MetricPoint cpuPoint = makePoint(i, tickTime, "CPU",
                    bucket.isEmpty() ? 0 : bucket.stream().mapToDouble(h -> nvl(h.getCpuRate())).average().orElse(0));
            MetricPoint memPoint = makePoint(i, tickTime, "内存",
                    bucket.isEmpty() ? 0 : bucket.stream().mapToDouble(h -> nvl(h.getMemRate())).average().orElse(0));
            MetricPoint gpuPoint = makePoint(i, tickTime, "GPU",
                    bucket.isEmpty() ? 0 : bucket.stream().mapToDouble(h -> nvl(h.getGpuRate())).average().orElse(0));

            points.add(cpuPoint);
            points.add(memPoint);
            points.add(gpuPoint);
        }

        MetricsResponse resp = new MetricsResponse();
        resp.setInterval(interval);
        resp.setSpanLabel(spanLabel);
        resp.setPoints(points);
        return resp;
    }

    // ────────── 5.7 QUEUE REORDER ──────────

    @Transactional
    public ServerItem reorderQueue(String serverIp, ReorderRequest req) {
        List<QueuedTaskEntry> entries = loadQueuedEntries(serverIp);
        if (entries.isEmpty()) {
            throw new IllegalArgumentException("没有可操作的排队任务");
        }

        int idx = -1;
        for (int i = 0; i < entries.size(); i++) {
            if (entries.get(i).taskId().equals(req.getTaskId())) {
                idx = i;
                break;
            }
        }
        if (idx < 0) {
            throw new IllegalArgumentException("排队任务不存在");
        }

        if ("up".equals(req.getDirection()) && idx > 0) {
            Collections.swap(entries, idx, idx - 1);
        } else if ("down".equals(req.getDirection()) && idx < entries.size() - 1) {
            Collections.swap(entries, idx, idx + 1);
        }

        // 重新分配 queueSortIndex: 1-based
        for (int i = 0; i < entries.size(); i++) {
            updateQueueSortIndex(entries.get(i).taskId(), i + 1);
        }

        return getServerDetail(serverIp);
    }

    // ────────── 5.8 UPDATE PRIORITY ──────────

    @Transactional
    public ServerItem updatePriority(String serverIp, PriorityRequest req) {
        if (!PRIORITY_VALUES.contains(req.getPriority())) {
            throw new IllegalArgumentException("优先级必须为 高/中/低");
        }

        // 更新优先级，queueSortIndex 设为 0（让自动规则重排）
        updateTaskPriority(req.getTaskId(), req.getPriority());

        // 自动重排（保持已有 queueSortIndex != 0 的，剩余的按优先级+FIFO）
        autoReorderQueued(serverIp);

        return getServerDetail(serverIp);
    }

    // ────────── 5.9 CANCEL QUEUE ──────────

    @Transactional
    public ServerItem cancelQueueTask(String serverIp, String taskId) {
        updateTaskStatus(taskId, "cancelled", null);
        autoReorderQueued(serverIp);
        return getServerDetail(serverIp);
    }

    // ────────── helpers ──────────

    private ServerItem toServerItem(ComputeServer server, ServerMetricSnapshot snap, boolean includeTasks) {
        ServerItem item = new ServerItem();
        item.setServerIp(server.getServerIp());
        item.setHostname(server.getHostname());

        if (snap != null) {
            item.setStatus(snap.getStatus());
            item.setCpuRate(nvl(snap.getCpuRate()));
            item.setMemRate(nvl(snap.getMemRate()));
            item.setGpuRate(nvl(snap.getGpuRate()));
            item.setDiskRate(nvl(snap.getDiskRate()));
            item.setGpuMemRate(nvl(snap.getGpuMemRate()));
            item.setNetworkIn(nvl(snap.getNetworkIn()));
            item.setNetworkOut(nvl(snap.getNetworkOut()));
            item.setGpuTemp(nvl(snap.getGpuTemp()));
        } else {
            item.setStatus("online");
        }

        ServerSpecs specs = new ServerSpecs();
        // spec_* 字段优先（手动添加的服务器），为空时从 K8s 自动采集的容量字段兜底
        specs.setCpu(server.getSpecCpu() != null && !server.getSpecCpu().isBlank()
                ? server.getSpecCpu()
                : (server.getCpuCores() != null && server.getCpuCores() > 0
                   ? String.format("%.1f 核", server.getCpuCores()) : null));
        specs.setMemory(server.getSpecMemory() != null && !server.getSpecMemory().isBlank()
                ? server.getSpecMemory()
                : (server.getMemoryGib() != null && server.getMemoryGib() > 0
                   ? String.format("%.0f GiB", server.getMemoryGib()) : null));
        specs.setGpu(server.getSpecGpu() != null && !server.getSpecGpu().isBlank()
                ? server.getSpecGpu()
                : (server.getGpuCount() != null && server.getGpuCount() > 0
                   ? server.getGpuCount() + " × GPU" : null));
        specs.setOs(server.getSpecOs() != null && !server.getSpecOs().isBlank()
                ? server.getSpecOs() : null);
        item.setSpecs(specs);

        if (includeTasks) {
            List<TrainingExperimentVersion> trainingTasks = trainingRepo
                    .findByServerIpAndStatusIn(server.getServerIp(), List.of("running", "queued"));
            List<InferenceTask> inferenceTasks = inferenceRepo
                    .findByServerIpAndStatusIn(server.getServerIp(), List.of("running", "queued"));

            List<RunningTask> running = new ArrayList<>();
            List<QueuedTask> queued = new ArrayList<>();

            for (TrainingExperimentVersion t : trainingTasks) {
                if ("running".equals(t.getStatus())) {
                    running.add(toRunningTask(t));
                } else if ("queued".equals(t.getStatus())) {
                    queued.add(toQueuedTask(t));
                }
            }
            for (InferenceTask t : inferenceTasks) {
                if ("running".equals(t.getStatus())) {
                    running.add(toRunningTask(t));
                } else if ("queued".equals(t.getStatus())) {
                    queued.add(toQueuedTask(t));
                }
            }

            // 排序
            queued.sort(compareQueued);

            item.setRunningTasks(running);
            item.setQueuedTasks(queued);
            item.setRunTask(running.size());
            item.setWaitTask(queued.size());
        }

        return item;
    }

    private RunningTask toRunningTask(TrainingExperimentVersion t) {
        RunningTask r = new RunningTask();
        r.setId(t.getId());
        r.setName(t.getName() != null ? t.getName() : t.getId());
        r.setModel(t.getModelVersionId());
        r.setDataset(t.getDatasetVersionId());
        r.setStartTime(t.getStartedAt() != null ? FMT.format(t.getStartedAt()) : "");
        r.setProgress(t.getProgress() != null ? t.getProgress() : 0);
        return r;
    }

    private RunningTask toRunningTask(InferenceTask t) {
        RunningTask r = new RunningTask();
        r.setId(t.getId());
        r.setName(t.getName() != null ? t.getName() : t.getId());
        r.setModel(t.getModelVersionId());
        r.setDataset(t.getDatasetVersionId());
        r.setStartTime(t.getStartedAt() != null ? FMT.format(t.getStartedAt()) : "");
        r.setProgress(t.getProgress() != null ? t.getProgress() : 0);
        return r;
    }

    private QueuedTask toQueuedTask(TrainingExperimentVersion t) {
        QueuedTask q = new QueuedTask();
        q.setId(t.getId());
        q.setName(t.getName() != null ? t.getName() : t.getId());
        q.setModel(t.getModelVersionId());
        q.setDataset(t.getDatasetVersionId());
        q.setSubmitTime(t.getCreatedAt() != null ? FMT.format(t.getCreatedAt()) : "");
        q.setPriority(t.getPriority() != null ? t.getPriority() : "中");
        q.setQueueSortIndex(t.getQueueSortIndex() != null ? t.getQueueSortIndex() : 0);
        return q;
    }

    private QueuedTask toQueuedTask(InferenceTask t) {
        QueuedTask q = new QueuedTask();
        q.setId(t.getId());
        q.setName(t.getName() != null ? t.getName() : t.getId());
        q.setModel(t.getModelVersionId());
        q.setDataset(t.getDatasetVersionId());
        q.setSubmitTime(t.getCreatedAt() != null ? FMT.format(t.getCreatedAt()) : "");
        q.setPriority(t.getPriority() != null ? t.getPriority() : "中");
        q.setQueueSortIndex(t.getQueueSortIndex() != null ? t.getQueueSortIndex() : 0);
        return q;
    }

    private static final Comparator<QueuedTask> compareQueued = (a, b) -> {
        if (a.getQueueSortIndex() != 0 && b.getQueueSortIndex() != 0) {
            return Integer.compare(a.getQueueSortIndex(), b.getQueueSortIndex());
        }
        if (a.getQueueSortIndex() != 0) return -1;
        if (b.getQueueSortIndex() != 0) return 1;
        // auto: priority desc, then submitTime asc
        int pa = PRIORITY_ORDER.getOrDefault(a.getPriority(), 2);
        int pb = PRIORITY_ORDER.getOrDefault(b.getPriority(), 2);
        if (pa != pb) return Integer.compare(pb, pa);
        return a.getSubmitTime().compareTo(b.getSubmitTime());
    };

    private List<QueuedTaskEntry> loadQueuedEntries(String serverIp) {
        List<QueuedTaskEntry> entries = new ArrayList<>();
        for (TrainingExperimentVersion t : trainingRepo.findByServerIpAndStatus(serverIp, "queued")) {
            entries.add(new QueuedTaskEntry(t.getId(), t.getQueueSortIndex() != null ? t.getQueueSortIndex() : 0,
                    t.getPriority() != null ? t.getPriority() : "中",
                    t.getCreatedAt() != null ? t.getCreatedAt() : Instant.EPOCH));
        }
        for (InferenceTask t : inferenceRepo.findByServerIpAndStatus(serverIp, "queued")) {
            entries.add(new QueuedTaskEntry(t.getId(), t.getQueueSortIndex() != null ? t.getQueueSortIndex() : 0,
                    t.getPriority() != null ? t.getPriority() : "中",
                    t.getCreatedAt() != null ? t.getCreatedAt() : Instant.EPOCH));
        }
        // 按当前排序规则排序
        entries.sort((a, b) -> {
            if (a.sortIndex() != 0 && b.sortIndex() != 0) return Integer.compare(a.sortIndex(), b.sortIndex());
            if (a.sortIndex() != 0) return -1;
            if (b.sortIndex() != 0) return 1;
            int pa = PRIORITY_ORDER.getOrDefault(a.priority(), 2);
            int pb = PRIORITY_ORDER.getOrDefault(b.priority(), 2);
            if (pa != pb) return Integer.compare(pb, pa);
            return a.createdAt().compareTo(b.createdAt());
        });
        return entries;
    }

    private void updateQueueSortIndex(String taskId, int index) {
        trainingRepo.findById(taskId).ifPresent(t -> {
            t.setQueueSortIndex(index);
            trainingRepo.save(t);
        });
        inferenceRepo.findById(taskId).ifPresent(t -> {
            t.setQueueSortIndex(index);
            inferenceRepo.save(t);
        });
    }

    private void updateTaskPriority(String taskId, String priority) {
        trainingRepo.findById(taskId).ifPresent(t -> {
            t.setPriority(priority);
            t.setQueueSortIndex(0);
            trainingRepo.save(t);
        });
        inferenceRepo.findById(taskId).ifPresent(t -> {
            t.setPriority(priority);
            t.setQueueSortIndex(0);
            inferenceRepo.save(t);
        });
    }

    private void updateTaskStatus(String taskId, String status, String errorMessage) {
        trainingRepo.findById(taskId).ifPresent(t -> {
            t.setStatus(status);
            t.setQueueSortIndex(0);
            if (errorMessage != null) t.setErrorMessage(errorMessage);
            trainingRepo.save(t);
        });
        inferenceRepo.findById(taskId).ifPresent(t -> {
            t.setStatus(status);
            t.setQueueSortIndex(0);
            if (errorMessage != null) t.setErrorMessage(errorMessage);
            inferenceRepo.save(t);
        });
    }

    private void cancelQueuedTasksOnServer(String serverIp) {
        for (TrainingExperimentVersion t : trainingRepo.findByServerIpAndStatus(serverIp, "queued")) {
            t.setStatus("cancelled");
            t.setQueueSortIndex(0);
            trainingRepo.save(t);
        }
        for (InferenceTask t : inferenceRepo.findByServerIpAndStatus(serverIp, "queued")) {
            t.setStatus("cancelled");
            t.setQueueSortIndex(0);
            inferenceRepo.save(t);
        }
    }

    private void autoReorderQueued(String serverIp) {
        List<QueuedTaskEntry> entries = loadQueuedEntries(serverIp);
        for (int i = 0; i < entries.size(); i++) {
            QueuedTaskEntry e = entries.get(i);
            if (e.sortIndex() == 0) {
                updateQueueSortIndex(e.taskId(), 0); // keep auto
            }
        }
    }

    record QueuedTaskEntry(String taskId, int sortIndex, String priority, Instant createdAt) {}

    private MetricPoint makePoint(int tickIndex, Instant time, String type, double value) {
        MetricPoint p = new MetricPoint();
        p.setTickIndex(tickIndex);
        p.setFullTime(FMT.format(time));
        p.setTime(FMT.format(time).substring(5)); // "MM-dd HH"
        p.setType(type);
        p.setValue(Math.round(value * 10.0) / 10.0);
        return p;
    }

    private double nvl(Double v) { return v != null ? v : 0.0; }

    private boolean isValidIp(String ip) {
        try {
            InetAddress.getAllByName(ip);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
