package com.tss.platform.dto.resource;

import lombok.Data;

import java.util.List;

@Data
public class ServerItem {
    private String serverIp;
    private String hostname;
    private Boolean enabled = true;   // 是否参与调度（false=禁用，不分配新任务）
    private String status;         // online / warning
    private double cpuRate;
    private double memRate;
    private double gpuRate;
    private double diskRate;
    private double gpuMemRate;
    private double networkIn;
    private double networkOut;
    private double gpuTemp;
    private int runTask;
    private int waitTask;
    private List<RunningTask> runningTasks;
    private List<QueuedTask> queuedTasks;
    private ServerSpecs specs;
}
