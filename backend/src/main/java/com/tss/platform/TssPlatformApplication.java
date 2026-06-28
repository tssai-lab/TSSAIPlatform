package com.tss.platform;

import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.config.TrainingMlflowProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
@EnableConfigurationProperties({TrainingMlflowProperties.class, TrainingKubernetesProperties.class})
public class TssPlatformApplication {

    public static void main(String[] args) {
        SpringApplication.run(TssPlatformApplication.class, args);
    }
}
