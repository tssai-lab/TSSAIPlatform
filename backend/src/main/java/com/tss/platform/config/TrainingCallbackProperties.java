package com.tss.platform.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "training.callback")
public class TrainingCallbackProperties {
    private String token = "replace-me";
    private String baseUrl = "http://127.0.0.1:8080";
}
