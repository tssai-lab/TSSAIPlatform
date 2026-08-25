package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.config.ComputeProperties;
import com.tss.platform.entity.ComputeServer;
import com.tss.platform.entity.ServerMetricSnapshot;
import com.tss.platform.repository.ComputeServerRepository;
import com.tss.platform.repository.ServerMetricHistoryRepository;
import com.tss.platform.repository.ServerMetricSnapshotRepository;
import com.tss.platform.training.ShellCommandRunner;
import com.tss.platform.training.TrainingEnvironmentService;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ServerMetricsCollectorTest {

    @Test
    void discoversKubernetesNodesWhenMetricsServerIsUnavailable() {
        Map<String, double[]> capacities = new LinkedHashMap<>();
        capacities.put("tss-ai-control-01", new double[]{16, 64, 0, 100});
        capacities.put("tss-ai-worker-01", new double[]{32, 128, 2, 500});

        assertThat(ServerMetricsCollector.discoveredNodeNames(
                capacities,
                Map.of(),
                Map.of(),
                Map.of()
        )).containsExactly("tss-ai-control-01", "tss-ai-worker-01");
    }

    @Test
    void mergesPartialNodeDiscoveryWithoutDuplicatesOrBlankNames() {
        Map<String, String> labels = new LinkedHashMap<>();
        labels.put("tss-ai-worker-01", "{}");
        labels.put("", "{}");

        assertThat(ServerMetricsCollector.discoveredNodeNames(
                Map.of("tss-ai-control-01", new double[]{16, 64}),
                Map.of("tss-ai-worker-01", "Ubuntu"),
                labels,
                Map.of("tss-ai-control-01", new ServerMetricsCollector.TopData(
                        0.1, 1024, 0, 0, 0))
        )).containsExactly("tss-ai-control-01", "tss-ai-worker-01");
    }

    @Test
    void oneInvalidNodeMetricDoesNotDiscardHealthyNodes() {
        Fixture fixture = fixture();
        String metrics = """
                {"items":[
                  {"metadata":{"name":"bad-node"},"usage":{"cpu":"7x","memory":"1Gi"}},
                  {"metadata":{"name":"good-node"},"usage":{"cpu":"128724u","memory":"2Gi"}}
                ]}
                """;
        when(fixture.shellRunner.run(any(), any(), anyInt()))
                .thenReturn(ShellCommandRunner.CommandResult.success(metrics));

        Map<String, ServerMetricsCollector.TopData> result = fixture.collector.collectTop();

        assertThat(result).containsOnlyKeys("good-node");
        assertThat(result.get("good-node").cpuUsed()).isEqualTo(0.128724);
        assertThat(result.get("good-node").memBytes()).isEqualTo(2L * 1024 * 1024 * 1024);
    }

    @Test
    void unavailableMetricsPreserveLastSuccessAndDoNotCreateFakeHistory() {
        Fixture fixture = fixture();
        ComputeServer server = server("k8s-master");
        ServerMetricSnapshot snapshot = new ServerMetricSnapshot();
        snapshot.setServerIp(server.getServerIp());
        snapshot.setCpuRate(42.0);
        snapshot.setMemRate(51.0);
        snapshot.setStatus("online");
        Instant lastSuccess = Instant.parse("2026-08-12T10:00:00Z");
        snapshot.setLastHeartbeat(lastSuccess);
        snapshot.setUpdatedAt(lastSuccess);
        when(fixture.snapshotRepo.findByServerIp(server.getServerIp())).thenReturn(Optional.of(snapshot));
        when(fixture.shellRunner.run(any(), any(), anyInt()))
                .thenReturn(ShellCommandRunner.CommandResult.failed(1, "", "metrics unavailable"));

        fixture.collector.collectOne(server, null, new double[]{4, 16});

        assertThat(snapshot.getCpuRate()).isEqualTo(42.0);
        assertThat(snapshot.getMemRate()).isEqualTo(51.0);
        assertThat(snapshot.getLastHeartbeat()).isEqualTo(lastSuccess);
        assertThat(snapshot.getUpdatedAt()).isAfter(lastSuccess);
        assertThat(snapshot.getStatus()).isEqualTo("warning");
        verify(fixture.snapshotRepo).save(snapshot);
        verify(fixture.historyRepo, never()).save(any());
    }

    @Test
    void unavailableFirstSampleDoesNotPersistHealthyZeros() {
        Fixture fixture = fixture();
        ComputeServer server = server("new-node");
        when(fixture.snapshotRepo.findByServerIp(server.getServerIp())).thenReturn(Optional.empty());

        fixture.collector.collectOne(server, null, new double[]{4, 16});

        verify(fixture.snapshotRepo, never()).save(any());
        verify(fixture.historyRepo, never()).save(any());
    }

    @Test
    void networkRateSkipsLegacyMegabyteSampleThenUsesByteDelta() {
        assertThat(ServerMetricsCollector.networkRate(10_485_760, 10, 30)).isZero();
        assertThat(ServerMetricsCollector.networkRate(12_582_912, 10_485_760, 2)).isEqualTo(1.0);
        assertThat(ServerMetricsCollector.networkRate(10_000, 10_000, 30)).isZero();
    }

    @Test
    void successfulZeroDiskAndNetworkSampleReplacesOldValues() {
        Fixture fixture = fixture();
        ComputeServer server = server("zero-node");
        ServerMetricSnapshot snapshot = new ServerMetricSnapshot();
        snapshot.setServerIp(server.getServerIp());
        snapshot.setDiskRate(50.0);
        snapshot.setNetworkIn(9.0);
        snapshot.setNetworkOut(8.0);
        when(fixture.snapshotRepo.findByServerIp(server.getServerIp())).thenReturn(Optional.of(snapshot));
        when(fixture.shellRunner.run(any(), any(), anyInt()))
                .thenReturn(ShellCommandRunner.CommandResult.success("""
                        {"node":{"fs":{"capacityBytes":1000,"availableBytes":1000}},
                         "network":{"interfaces":[{"rxBytes":0,"txBytes":0}]}}
                        """));

        fixture.collector.collectOne(
                server,
                new ServerMetricsCollector.TopData(0.1, 1024, 1.0, 2.0, 0),
                new double[]{4, 16}
        );

        assertThat(snapshot.getDiskRate()).isZero();
        assertThat(snapshot.getNetworkIn()).isZero();
        assertThat(snapshot.getNetworkOut()).isZero();
    }

    @Test
    void diskUsageAtThresholdMarksSnapshotAsWarning() {
        Fixture fixture = fixture();
        ComputeServer server = server("disk-node");
        ServerMetricSnapshot snapshot = new ServerMetricSnapshot();
        snapshot.setServerIp(server.getServerIp());
        snapshot.setDiskRate(85.0);
        when(fixture.snapshotRepo.findByServerIp(server.getServerIp())).thenReturn(Optional.of(snapshot));
        when(fixture.shellRunner.run(any(), any(), anyInt()))
                .thenReturn(ShellCommandRunner.CommandResult.failed(1, "", "stats unavailable"));

        fixture.collector.collectOne(
                server,
                new ServerMetricsCollector.TopData(0.1, 1024, 1.0, 2.0, 0),
                new double[]{4, 16}
        );

        assertThat(snapshot.getStatus()).isEqualTo("warning");
    }

    private static ComputeServer server(String name) {
        ComputeServer server = new ComputeServer();
        server.setServerIp(name);
        server.setK8sNodeName(name);
        return server;
    }

    private static Fixture fixture() {
        ComputeServerRepository serverRepo = mock(ComputeServerRepository.class);
        ServerMetricSnapshotRepository snapshotRepo = mock(ServerMetricSnapshotRepository.class);
        ServerMetricHistoryRepository historyRepo = mock(ServerMetricHistoryRepository.class);
        TrainingEnvironmentService envService = mock(TrainingEnvironmentService.class);
        ShellCommandRunner shellRunner = mock(ShellCommandRunner.class);
        Path root = Path.of(".").toAbsolutePath().normalize();
        when(envService.resolveProjectRoot()).thenReturn(root);
        when(envService.resolveKubeconfig()).thenReturn(root.resolve("kubeconfig"));
        when(envService.resolveKubectl()).thenReturn(root.resolve("kubectl"));
        when(envService.kubectlCommand(any(), any(String[].class)))
                .thenAnswer(invocation -> List.of("kubectl"));
        ServerMetricsCollector collector = new ServerMetricsCollector(
                serverRepo,
                snapshotRepo,
                historyRepo,
                envService,
                shellRunner,
                new ComputeProperties(),
                new ObjectMapper()
        );
        return new Fixture(collector, snapshotRepo, historyRepo, shellRunner);
    }

    private record Fixture(
            ServerMetricsCollector collector,
            ServerMetricSnapshotRepository snapshotRepo,
            ServerMetricHistoryRepository historyRepo,
            ShellCommandRunner shellRunner
    ) {
    }
}
