package com.tss.platform.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "remote.ssh")
public class RemoteSshProperties {
    private String host = "47.114.84.133";
    private int port = 22;
    private String username = "root";
    private String privateKeyPath;
    private String password;
    private int connectTimeoutMs = 15000;
    private int commandTimeoutMs = 180000;
}
