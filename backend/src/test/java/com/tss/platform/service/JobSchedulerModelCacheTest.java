package com.tss.platform.service;

import com.tss.platform.config.InferenceModelCacheProperties;
import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.entity.ComputeServer;
import com.tss.platform.entity.InferenceTask;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.ComputeServerRepository;
import com.tss.platform.repository.InferenceTaskRepository;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.training.TrainingExecutorRouter;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JobSchedulerModelCacheTest {

    @Test
    void cacheEnabledExcludesNodesWithoutReadyLabel() {
        Fixture fixture = new Fixture();
        ComputeServer unready = node("10.0.0.1", false);
        ComputeServer ready = node("10.0.0.2", true);
        when(fixture.computeServers.findByDeletedFalse()).thenReturn(List.of(unready, ready));

        String assigned = fixture.scheduler.assignNodeForInference(new InferenceTask(), "a".repeat(64));

        assertEquals("10.0.0.2", assigned);
        assertFalse(fixture.scheduler.isCacheReady(unready));
        assertTrue(fixture.scheduler.isCacheReady(ready));
    }

    @Test
    void sameDigestUsesStableRendezvousAffinityAcrossReadyNodes() {
        Fixture fixture = new Fixture();
        ComputeServer first = node("10.0.0.1", true);
        ComputeServer second = node("10.0.0.2", true);
        when(fixture.computeServers.findByDeletedFalse()).thenReturn(List.of(first, second));
        String digest = "b".repeat(64);
        String expected = Long.compareUnsigned(
                JobScheduler.affinityScore(digest, first.getServerIp()),
                JobScheduler.affinityScore(digest, second.getServerIp())) > 0
                ? first.getServerIp() : second.getServerIp();

        assertEquals(expected, fixture.scheduler.assignNodeForInference(new InferenceTask(), digest));
        assertEquals(expected, fixture.scheduler.assignNodeForInference(new InferenceTask(), digest));
    }

    @Test
    void cacheDisabledKeepsExistingResourceFirstScheduling() {
        Fixture fixture = new Fixture(false);
        ComputeServer smaller = node("10.0.0.1", false);
        smaller.setCpuCores(2.0);
        smaller.setMemoryGib(2.0);
        ComputeServer larger = node("10.0.0.2", false);
        when(fixture.computeServers.findByDeletedFalse()).thenReturn(List.of(smaller, larger));
        String digest = null;
        for (int index = 0; index < 100; index++) {
            String candidate = String.format("%064x", index);
            if (Long.compareUnsigned(
                    JobScheduler.affinityScore(candidate, smaller.getServerIp()),
                    JobScheduler.affinityScore(candidate, larger.getServerIp())) > 0) {
                digest = candidate;
                break;
            }
        }

        assertNotNull(digest);
        assertEquals(larger.getServerIp(),
                fixture.scheduler.assignNodeForInference(new InferenceTask(), digest));
    }

    @Test
    void gpuSelectorFailsClosedWhenNodeLabelsAreMissingOrMalformed() {
        Fixture fixture = new Fixture(false);
        TrainingExperimentVersion task = new TrainingExperimentVersion();
        task.setRunSpecJson("""
                {"resources":{"cpuRequest":"1","memoryRequest":"1Gi","gpuCount":1}}
                """);
        ComputeServer missing = gpuNode("10.0.0.1", null);
        ComputeServer malformed = gpuNode("10.0.0.2", "not-json");
        when(fixture.computeServers.findByDeletedFalse()).thenReturn(List.of(missing, malformed));

        assertNull(fixture.scheduler.assignNodeForTraining(
                task, Map.of("tss.ai/accelerator", "nvidia")));

        ComputeServer matching = gpuNode(
                "10.0.0.3", "{\"tss.ai/accelerator\":\"nvidia\",\"tss.ai/node-pool\":\"cpu\"}");
        when(fixture.computeServers.findByDeletedFalse()).thenReturn(List.of(missing, malformed, matching));
        assertEquals("10.0.0.3", fixture.scheduler.assignNodeForTraining(
                task, Map.of("tss.ai/accelerator", "nvidia")));
    }

    @Test
    void cpuSchedulingKeepsHistoricalFallbackWhenMetricsLabelsAreTemporarilyMissing() {
        Fixture fixture = new Fixture(false);
        ComputeServer cpu = node("10.0.0.4", false);
        cpu.setK8sLabelsJson(null);
        when(fixture.computeServers.findByDeletedFalse()).thenReturn(List.of(cpu));

        assertEquals("10.0.0.4",
                fixture.scheduler.assignNodeForInference(new InferenceTask(), null));
    }

    private static ComputeServer node(String serverIp, boolean cacheReady) {
        ComputeServer node = new ComputeServer();
        node.setServerIp(serverIp);
        node.setStatus("online");
        node.setEnabled(true);
        node.setDeleted(false);
        node.setCpuCores(8.0);
        node.setMemoryGib(16.0);
        node.setGpuCount(0);
        node.setK8sLabelsJson("{\"tss.ai/node-pool\":\"cpu\",\"tss.ai/model-cache-ready\":\""
                + cacheReady + "\"}");
        return node;
    }

    private static ComputeServer gpuNode(String serverIp, String labelsJson) {
        ComputeServer node = node(serverIp, false);
        node.setGpuCount(2);
        node.setK8sLabelsJson(labelsJson);
        return node;
    }

    private static final class Fixture {
        private final ComputeServerRepository computeServers = mock(ComputeServerRepository.class);
        private final TrainingExperimentVersionRepository trainingTasks =
                mock(TrainingExperimentVersionRepository.class);
        private final InferenceTaskRepository inferenceTasks = mock(InferenceTaskRepository.class);
        private final JobScheduler scheduler;

        private Fixture() {
            this(true);
        }

        private Fixture(boolean cacheEnabled) {
            when(trainingTasks.findByStatus("running")).thenReturn(List.of());
            when(trainingTasks.findByStatus("scheduled")).thenReturn(List.of());
            when(inferenceTasks.findByStatus("running")).thenReturn(List.of());
            when(inferenceTasks.findByStatus("scheduled")).thenReturn(List.of());
            scheduler = new JobScheduler(
                    computeServers,
                    trainingTasks,
                    inferenceTasks,
                    new TrainingKubernetesProperties(),
                    mock(TrainingExecutorRouter.class),
                    mock(TransactionTemplate.class)
            );
            InferenceModelCacheProperties properties = new InferenceModelCacheProperties();
            properties.setEnabled(cacheEnabled);
            scheduler.setModelCacheProperties(properties);
        }
    }
}
