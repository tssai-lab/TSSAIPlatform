package com.tss.platform.config;

import io.minio.BucketExistsArgs;
import io.minio.MinioClient;
import io.minio.errors.ErrorResponseException;
import io.minio.messages.ErrorResponse;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.test.context.support.TestPropertySourceUtils;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MinioInitializerTest {

    @Test
    void springCanSelectTheProductionConstructor() {
        MinioClient minioClient = mock(MinioClient.class);
        MinioConfig minioConfig = new MinioConfig();
        minioConfig.setBucket("models");

        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            TestPropertySourceUtils.addInlinedPropertiesToEnvironment(
                    context,
                    "minio.init.max-attempts=1",
                    "minio.init.initial-backoff-ms=0");
            context.registerBean(MinioClient.class, () -> minioClient);
            context.registerBean(MinioConfig.class, () -> minioConfig);
            context.register(MinioInitializer.class);

            assertDoesNotThrow(context::refresh);
            assertNotNull(context.getBean(MinioInitializer.class));
        }
    }

    @Test
    void retriesBucketCheckBeforeFailingStartup() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        MinioConfig minioConfig = new MinioConfig();
        minioConfig.setBucket("models");
        when(minioClient.bucketExists(any(BucketExistsArgs.class)))
                .thenThrow(new RuntimeException("connect refused"))
                .thenReturn(true);
        MinioInitializer initializer = new MinioInitializer(
                minioClient,
                minioConfig,
                3,
                Duration.ZERO,
                duration -> {
                }
        );

        initializer.run(null);

        verify(minioClient, times(2)).bucketExists(any(BucketExistsArgs.class));
    }

    @Test
    void doesNotRetryInvalidBucketName() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        MinioConfig minioConfig = new MinioConfig();
        minioConfig.setBucket("bad_bucket");
        MinioInitializer initializer = new MinioInitializer(
                minioClient,
                minioConfig,
                3,
                Duration.ZERO,
                duration -> {
                }
        );

        assertThrows(IllegalArgumentException.class, () -> initializer.run(null));

        verify(minioClient, times(0)).bucketExists(any(BucketExistsArgs.class));
    }

    @Test
    void doesNotRetryCredentialFailure() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        MinioConfig minioConfig = new MinioConfig();
        minioConfig.setBucket("models");
        when(minioClient.bucketExists(any(BucketExistsArgs.class)))
                .thenThrow(errorResponse("InvalidAccessKeyId"));
        MinioInitializer initializer = new MinioInitializer(
                minioClient,
                minioConfig,
                3,
                Duration.ZERO,
                duration -> {
                }
        );

        assertThrows(ErrorResponseException.class, () -> initializer.run(null));

        verify(minioClient, times(1)).bucketExists(any(BucketExistsArgs.class));
    }

    private ErrorResponseException errorResponse(String code) {
        return new ErrorResponseException(
                new ErrorResponse(code, code, "models", null, "models", "request-1", "host-1"),
                null,
                null
        );
    }
}
