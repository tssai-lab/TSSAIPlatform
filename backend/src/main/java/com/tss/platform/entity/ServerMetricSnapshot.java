package com.tss.platform.entity;

import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Getter
@Setter
@Entity
@Table(name = "server_metric_snapshot")
public class ServerMetricSnapshot {

    @Id
    @Column(name = "server_ip", length = 45)
    private String serverIp;

    @Column(name = "cpu_rate")
    private Double cpuRate = 0.0;

    @Column(name = "mem_rate")
    private Double memRate = 0.0;

    @Column(name = "gpu_rate")
    private Double gpuRate = 0.0;

    @Column(name = "gpu_mem_rate")
    private Double gpuMemRate = 0.0;

    @Column(name = "disk_rate")
    private Double diskRate = 0.0;

    @Column(name = "network_in")
    private Double networkIn = 0.0;

    @Column(name = "network_out")
    private Double networkOut = 0.0;

    @Column(name = "gpu_temp")
    private Double gpuTemp = 0.0;

    @Column(name = "status", length = 16)
    private String status = "online";

    @Column(name = "last_heartbeat")
    private Instant lastHeartbeat;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
