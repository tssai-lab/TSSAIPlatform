package com.tss.platform.config;

import io.minio.MinioClient;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class MinioInitializer implements ApplicationRunner {

    private final MinioClient minioClient;
    private final MinioConfig minioConfig;

    public MinioInitializer(MinioClient minioClient, MinioConfig minioConfig) {
        this.minioClient = minioClient;
        this.minioConfig = minioConfig;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        String bucket = minioConfig.getBucket();
        if (!minioClient.bucketExists(
                io.minio.BucketExistsArgs.builder().bucket(bucket).build())) {
            minioClient.makeBucket(
                    io.minio.MakeBucketArgs.builder().bucket(bucket).build());
        }
    }
}
