package com.tss.platform.service;

import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class DemoAssetInitService {
    private static final String DEMO_DATASET_NAME = "demo-yolo-cpu-dataset";

    private final MinioService minioService;
    private final DatasetAssetRepository datasetAssetRepository;
    private final DatasetVersionRepository datasetVersionRepository;
    private final ModelAssetRepository modelAssetRepository;
    private final ModelVersionRepository modelVersionRepository;

    public DemoAssetInitService(
            MinioService minioService,
            DatasetAssetRepository datasetAssetRepository,
            DatasetVersionRepository datasetVersionRepository,
            ModelAssetRepository modelAssetRepository,
            ModelVersionRepository modelVersionRepository
    ) {
        this.minioService = minioService;
        this.datasetAssetRepository = datasetAssetRepository;
        this.datasetVersionRepository = datasetVersionRepository;
        this.modelAssetRepository = modelAssetRepository;
        this.modelVersionRepository = modelVersionRepository;
    }

    @Transactional
    public Map<String, Object> initDemoAssets() {
        try {
            ModelVersion modelVersion = latestModelVersion();
            if (modelVersion == null) {
                throw new IllegalStateException("没有可用模型版本，请先在模型管理上传 YOLO 权重或模型压缩包");
            }

            DatasetVersion datasetVersion = latestDatasetVersion();
            if (datasetVersion == null) {
                datasetVersion = createDemoDatasetVersion();
            }

            Map<String, Object> result = new HashMap<>();
            result.put("datasetAssetId", datasetVersion.getAssetId());
            result.put("datasetVersionId", datasetVersion.getId());
            result.put("datasetStoragePath", datasetVersion.getStoragePath());
            result.put("modelAssetId", modelVersion.getAssetId());
            result.put("modelVersionId", modelVersion.getId());
            result.put("modelStoragePath", modelVersion.getStoragePath());
            return result;
        } catch (Exception e) {
            throw new IllegalStateException("初始化 demo 资产失败: " + e.getMessage(), e);
        }
    }

    private ModelVersion latestModelVersion() {
        List<ModelVersion> versions = modelVersionRepository.findAll();
        return versions.stream()
                .max(Comparator.comparing(ModelVersion::getCreatedAt, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);
    }

    private DatasetVersion latestDatasetVersion() {
        List<DatasetVersion> versions = datasetVersionRepository.findAll();
        return versions.stream()
                .max(Comparator.comparing(DatasetVersion::getCreatedAt, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);
    }

    private DatasetVersion createDemoDatasetVersion() throws Exception {
        DatasetAsset datasetAsset = datasetAssetRepository.findByName(DEMO_DATASET_NAME)
                .orElseGet(this::newDatasetAsset);
        if (datasetAsset.getId() == null) {
            datasetAsset = datasetAssetRepository.save(datasetAsset);
        }

        String datasetVersionTag = nextVersionTag(datasetVersionRepository.findTopByAssetIdOrderByCreatedAtDesc(datasetAsset.getId())
                .map(DatasetVersion::getVersion).orElse("v0"));
        byte[] datasetZip = buildDemoYoloDatasetZip();
        String datasetStoragePath = "datasets/" + datasetAsset.getId() + "/" + datasetVersionTag + "/dataset.zip";
        minioService.uploadStream(datasetStoragePath, new ByteArrayInputStream(datasetZip), datasetZip.length, "application/zip");

        DatasetVersion datasetVersion = new DatasetVersion();
        datasetVersion.setId("dataset-ver-" + shortId());
        datasetVersion.setAssetId(datasetAsset.getId());
        datasetVersion.setVersion(datasetVersionTag);
        datasetVersion.setFileName("demo-yolo-dataset.zip");
        datasetVersion.setStoragePath(datasetStoragePath);
        datasetVersion.setSizeBytes((long) datasetZip.length);
        datasetVersion.setRemark("auto-generated YOLO demo dataset");
        datasetVersion.setCreatedAt(Instant.now());
        return datasetVersionRepository.save(datasetVersion);
    }

    private DatasetAsset newDatasetAsset() {
        DatasetAsset asset = new DatasetAsset();
        asset.setId("dataset-asset-" + shortId());
        asset.setName(DEMO_DATASET_NAME);
        asset.setType("CV");
        asset.setRemark("auto-generated demo dataset");
        asset.setCreatedAt(Instant.now());
        asset.setUpdatedAt(Instant.now());
        return asset;
    }

    private String nextVersionTag(String lastVersion) {
        try {
            String clean = lastVersion == null ? "v0" : lastVersion.trim();
            if (!clean.startsWith("v")) {
                clean = "v0";
            }
            int num = Integer.parseInt(clean.substring(1));
            return "v" + (num + 1);
        } catch (Exception ignored) {
            return "v1";
        }
    }

    private byte[] buildDemoYoloDatasetZip() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("data.yaml"));
            zip.write((
                    "path: .\n" +
                            "train: train/images\n" +
                            "val: val/images\n" +
                            "names:\n" +
                            "  0: square\n"
            ).getBytes());
            zip.closeEntry();

            addYoloSample(zip, "train/images/img1.png", "train/labels/img1.txt", 28, 28, 72, 72);
            addYoloSample(zip, "train/images/img2.png", "train/labels/img2.txt", 40, 20, 90, 70);
            addYoloSample(zip, "val/images/img3.png", "val/labels/img3.txt", 18, 18, 64, 64);
        }
        return out.toByteArray();
    }

    private void addYoloSample(
            ZipOutputStream zip,
            String imagePath,
            String labelPath,
            int x1,
            int y1,
            int x2,
            int y2
    ) throws Exception {
        int width = 128;
        int height = 128;
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(18, 18, 18));
        g.fillRect(0, 0, width, height);
        g.setColor(new Color(102, 204, 255));
        g.fillRect(x1, y1, x2 - x1, y2 - y1);
        g.dispose();

        ByteArrayOutputStream imageOut = new ByteArrayOutputStream();
        ImageIO.write(img, "png", imageOut);

        zip.putNextEntry(new ZipEntry(imagePath));
        zip.write(imageOut.toByteArray());
        zip.closeEntry();

        double cx = ((x1 + x2) / 2.0) / width;
        double cy = ((y1 + y2) / 2.0) / height;
        double bw = (x2 - x1) / (double) width;
        double bh = (y2 - y1) / (double) height;
        String label = String.format("0 %.6f %.6f %.6f %.6f%n", cx, cy, bw, bh);
        zip.putNextEntry(new ZipEntry(labelPath));
        zip.write(label.getBytes());
        zip.closeEntry();
    }

    private String shortId() {
        return UUID.randomUUID().toString().replace("-", "");
    }
}
