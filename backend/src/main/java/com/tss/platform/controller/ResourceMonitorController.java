package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.dto.resource.*;
import com.tss.platform.security.AuthContext;
import com.tss.platform.service.ResourceMonitorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/resource-monitor")
public class ResourceMonitorController {

    private static final Logger LOG = LoggerFactory.getLogger(ResourceMonitorController.class);

    private final ResourceMonitorService monitorService;
    private final AuthContext authContext;

    public ResourceMonitorController(ResourceMonitorService monitorService, AuthContext authContext) {
        this.monitorService = monitorService;
        this.authContext = authContext;
    }

    // ── 5.1 GET /summary ──
    @GetMapping("/summary")
    public ApiResponse<SummaryDto> summary() {
        return ApiResponse.ok(monitorService.getSummary());
    }

    // ── 5.2 GET /servers ──
    @GetMapping("/servers")
    public ApiResponse<List<ServerItem>> servers(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, defaultValue = "all") String status) {
        return ApiResponse.ok(monitorService.listServers(keyword, status));
    }

    // ── 5.3 POST /servers ──
    @PostMapping("/servers")
    public ApiResponse<ServerItem> addServer(@RequestBody AddServerRequest req) {
        requireAdmin();
        return ApiResponse.ok(monitorService.addServer(req));
    }

    // ── 5.4 GET /servers/{serverIp} ──
    @GetMapping("/servers/{serverIp}")
    public ApiResponse<ServerItem> serverDetail(@PathVariable String serverIp) {
        return ApiResponse.ok(monitorService.getServerDetail(serverIp));
    }

    // ── 5.5 DELETE /servers/{serverIp} ──
    @DeleteMapping("/servers/{serverIp}")
    public ApiResponse<Void> deleteServer(@PathVariable String serverIp) {
        requireAdmin();
        monitorService.deleteServer(serverIp);
        return ApiResponse.ok(null);
    }

    // ── 5.5b PUT /servers/{serverIp}/enabled ──
    @PutMapping("/servers/{serverIp}/enabled")
    public ApiResponse<ServerItem> updateServerEnabled(
            @PathVariable String serverIp,
            @RequestBody UpdateServerEnabledRequest req) {
        requireAdmin();
        return ApiResponse.ok(monitorService.updateServerEnabled(serverIp, req));
    }

    // ── 5.6 GET /servers/{serverIp}/metrics ──
    @GetMapping("/servers/{serverIp}/metrics")
    public ApiResponse<MetricsResponse> metrics(
            @PathVariable String serverIp,
            @RequestParam(defaultValue = "1hour") String interval) {
        return ApiResponse.ok(monitorService.getMetrics(serverIp, interval));
    }

    // ── 5.7 PUT /servers/{serverIp}/queue/reorder ──
    @PutMapping("/servers/{serverIp}/queue/reorder")
    public ApiResponse<ServerItem> reorderQueue(
            @PathVariable String serverIp,
            @RequestBody ReorderRequest req) {
        requireAdmin();
        return ApiResponse.ok(monitorService.reorderQueue(serverIp, req));
    }

    // ── 5.8 PUT /servers/{serverIp}/queue/priority ──
    @PutMapping("/servers/{serverIp}/queue/priority")
    public ApiResponse<ServerItem> updatePriority(
            @PathVariable String serverIp,
            @RequestBody PriorityRequest req) {
        requireAdmin();
        return ApiResponse.ok(monitorService.updatePriority(serverIp, req));
    }

    // ── 5.9 DELETE /servers/{serverIp}/queue/{taskId} ──
    @DeleteMapping("/servers/{serverIp}/queue/{taskId}")
    public ApiResponse<ServerItem> cancelQueue(
            @PathVariable String serverIp,
            @PathVariable String taskId) {
        requireAdmin();
        return ApiResponse.ok(monitorService.cancelQueueTask(serverIp, taskId));
    }

    // ── 5.10 GET /queue（全局排队，按资源池分组）──
    @GetMapping("/queue")
    public ApiResponse<List<GlobalQueuedTask>> globalQueue() {
        return ApiResponse.ok(monitorService.listGlobalQueued());
    }

    /** 集群、故障 Pod 和实际镜像明细只对超级管理员开放。 */
    @GetMapping("/kubernetes/diagnostics")
    public ApiResponse<KubernetesDiagnosticsDto> kubernetesDiagnostics() {
        requireSuperAdmin();
        return ApiResponse.ok(monitorService.getKubernetesDiagnostics());
    }

    // ── 5.11 PUT /queue/reorder（全局排队同池内调整）──
    @PutMapping("/queue/reorder")
    public ApiResponse<List<GlobalQueuedTask>> reorderGlobalQueue(@RequestBody ReorderRequest req) {
        requireAdmin();
        return ApiResponse.ok(monitorService.reorderGlobalQueue(req));
    }

    // ── 5.12 DELETE /queue/{taskId}（取消全局排队）──
    @DeleteMapping("/queue/{taskId}")
    public ApiResponse<List<GlobalQueuedTask>> cancelGlobalQueue(@PathVariable String taskId) {
        requireAdmin();
        return ApiResponse.ok(monitorService.cancelGlobalQueueTask(taskId));
    }

    private void requireAdmin() {
        if (!authContext.isAdmin()) {
            throw new IllegalArgumentException("仅管理员可执行此操作");
        }
    }

    private void requireSuperAdmin() {
        if (!authContext.isSuperAdmin()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "仅超级管理员可查看 Kubernetes 诊断详情"
            );
        }
    }
}
