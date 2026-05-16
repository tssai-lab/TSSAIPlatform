package com.tss.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class TssPlatformApplication {

    public static void main(String[] args) {
        SpringApplication.run(TssPlatformApplication.class, args);
    }
}
