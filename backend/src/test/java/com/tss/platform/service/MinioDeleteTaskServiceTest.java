package com.tss.platform.service;

import com.tss.platform.config.MinioConfig;
import com.tss.platform.entity.MinioDeleteTask;
import com.tss.platform.repository.MinioDeleteTaskRepository;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MinioDeleteTaskServiceTest {

    @Test
    void resetsStaleProcessingTasksBeforePollingPendingIds() {
        Fixture fixture = new Fixture();
        MinioDeleteTask pending = new MinioDeleteTask();
        pending.setId("minio-del-1");
        when(fixture.repo.resetStaleProcessing(
                eq(MinioDeleteTaskService.STATUS_PROCESSING),
                eq(MinioDeleteTaskService.STATUS_PENDING),
                any(Instant.class),
                any(Instant.class)
        )).thenReturn(1);
        when(fixture.repo.findTop50ByStatusOrderByCreatedAtAsc(MinioDeleteTaskService.STATUS_PENDING))
                .thenReturn(List.of(pending));

        List<String> ids = fixture.service.findPendingTaskIds();

        assertEquals(List.of("minio-del-1"), ids);
        InOrder order = inOrder(fixture.repo);
        order.verify(fixture.repo).resetStaleProcessing(
                eq(MinioDeleteTaskService.STATUS_PROCESSING),
                eq(MinioDeleteTaskService.STATUS_PENDING),
                any(Instant.class),
                any(Instant.class)
        );
        order.verify(fixture.repo)
                .findTop50ByStatusOrderByCreatedAtAsc(MinioDeleteTaskService.STATUS_PENDING);
    }

    private static final class Fixture {
        private final MinioDeleteTaskRepository repo = mock(MinioDeleteTaskRepository.class);
        private final MinioService minioService = mock(MinioService.class);
        private final MinioDeleteTaskService service;

        private Fixture() {
            MinioConfig minioConfig = new MinioConfig();
            minioConfig.setBucket("models");
            service = new MinioDeleteTaskService(
                    repo,
                    minioService,
                    minioConfig,
                    new NoOpTransactionManager()
            );
        }
    }

    private static final class NoOpTransactionManager implements PlatformTransactionManager {
        @Override
        public TransactionStatus getTransaction(TransactionDefinition definition) {
            return new SimpleTransactionStatus();
        }

        @Override
        public void commit(TransactionStatus status) {
        }

        @Override
        public void rollback(TransactionStatus status) {
        }
    }
}
