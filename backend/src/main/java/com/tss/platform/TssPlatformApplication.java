package com.tss.platform;

import com.tss.platform.config.RemoteSshProperties;
import com.tss.platform.config.TrainingCallbackProperties;
import com.tss.platform.config.TrainingK8sProperties;
import com.tss.platform.config.TrainingMlflowProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({
        TrainingK8sProperties.class,
        TrainingCallbackProperties.class,
        RemoteSshProperties.class,
        TrainingMlflowProperties.class
})
public class TssPlatformApplication {

    public static void main(String[] args) {
        SpringApplication.run(TssPlatformApplication.class, args);
    }
}
