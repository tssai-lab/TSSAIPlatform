package com.tss.platform.service;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.tss.platform.config.RemoteSshProperties;
import com.tss.platform.config.TrainingK8sProperties;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Service
public class RemoteK8sInstallService {
    private final RemoteSshProperties sshProperties;
    private final TrainingK8sProperties trainingK8sProperties;

    public RemoteK8sInstallService(RemoteSshProperties sshProperties, TrainingK8sProperties trainingK8sProperties) {
        this.sshProperties = sshProperties;
        this.trainingK8sProperties = trainingK8sProperties;
    }

    public Map<String, Object> installOrCheckK3s() {
        try {
            String script = Files.readString(resolveInstallScript(), StandardCharsets.UTF_8);
            String encoded = Base64.getEncoder().encodeToString(script.getBytes(StandardCharsets.UTF_8));
            execute("echo '" + encoded + "' | base64 -d | bash");
            String nodeOutput = execute("kubectl get nodes -o wide");
            String namespaceOutput = execute(
                    "kubectl create namespace " + trainingK8sProperties.getNamespace()
                            + " --dry-run=client -o yaml | kubectl apply -f -"
            );
            String kubeconfigRaw = execute("cat /etc/rancher/k3s/k3s.yaml");
            String rewritten = kubeconfigRaw.replace("127.0.0.1", sshProperties.getHost());
            Path localKubeconfig = resolveLocalKubeconfigPath();
            Files.createDirectories(localKubeconfig.getParent());
            Files.writeString(localKubeconfig, rewritten, StandardCharsets.UTF_8);
            trainingK8sProperties.setKubeconfigPath(localKubeconfig.toString());

            Map<String, Object> data = new HashMap<>();
            data.put("installedAt", Instant.now().toString());
            data.put("host", sshProperties.getHost());
            data.put("nodeStatus", nodeOutput);
            data.put("namespaceResult", namespaceOutput);
            data.put("kubeconfigPath", localKubeconfig.toString());
            return data;
        } catch (Exception e) {
            throw new IllegalStateException("远程安装/检查 K3s 失败: " + e.getMessage(), e);
        }
    }

    private Path resolveLocalKubeconfigPath() {
        String configured = trainingK8sProperties.getKubeconfigPath();
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured.trim());
        }
        return Path.of(System.getProperty("user.home"), ".kube", "tss-remote-k3s.yaml");
    }

    private Path resolveInstallScript() {
        Path[] candidates = new Path[]{
                Path.of(System.getProperty("user.dir"), "..", "scripts", "k8s", "install-k3s.sh").normalize(),
                Path.of(System.getProperty("user.dir"), "scripts", "k8s", "install-k3s.sh").normalize(),
                Path.of("/opt/tss-platform/scripts/k8s/install-k3s.sh")
        };
        for (Path candidate : candidates) {
            if (Files.exists(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("未找到 install-k3s.sh");
    }

    private String execute(String command) throws Exception {
        JSch jsch = new JSch();
        if (sshProperties.getPrivateKeyPath() != null && !sshProperties.getPrivateKeyPath().isBlank()) {
            jsch.addIdentity(sshProperties.getPrivateKeyPath());
        }
        Session session = jsch.getSession(sshProperties.getUsername(), sshProperties.getHost(), sshProperties.getPort());
        if (sshProperties.getPassword() != null && !sshProperties.getPassword().isBlank()) {
            session.setPassword(sshProperties.getPassword());
        }
        session.setConfig("StrictHostKeyChecking", "no");
        session.connect(sshProperties.getConnectTimeoutMs());
        try {
            ChannelExec channel = (ChannelExec) session.openChannel("exec");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ByteArrayOutputStream err = new ByteArrayOutputStream();
            channel.setCommand(command);
            channel.setOutputStream(out);
            channel.setErrStream(err);
            channel.connect();
            long deadline = System.currentTimeMillis() + sshProperties.getCommandTimeoutMs();
            while (!channel.isClosed()) {
                if (System.currentTimeMillis() > deadline) {
                    channel.disconnect();
                    throw new IllegalStateException("远程命令超时");
                }
                Thread.sleep(200);
            }
            int exitCode = channel.getExitStatus();
            channel.disconnect();
            String stdout = out.toString(StandardCharsets.UTF_8);
            String stderr = err.toString(StandardCharsets.UTF_8);
            if (exitCode != 0) {
                throw new IllegalStateException("exitCode=" + exitCode + ", stderr=" + stderr + ", stdout=" + stdout);
            }
            return stdout.isBlank() ? stderr : stdout;
        } finally {
            session.disconnect();
        }
    }
}
