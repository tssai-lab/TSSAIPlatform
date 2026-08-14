package com.tss.platform.asset.spec;

import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Versioned, code-reviewed artifact contracts that may be referenced by a training plan.
 * YAML can reference these IDs but cannot register validators or executable code.
 */
@Component
public class ArtifactSpecRegistry {

    private static final Pattern SPEC_ID_PATTERN = Pattern.compile(
            "^(model|dataset)\\.[a-z0-9][a-z0-9.-]{1,95}/v[1-9][0-9]*$"
    );

    private final Map<String, ArtifactSpecDefinition> definitions;

    public ArtifactSpecRegistry() {
        this(List.of(
                spec("model.cv.yolo-weight/v1", AssetKind.MODEL, AssetDirectoryCategory.CV,
                        "YOLO 权重", ArtifactSpecDefinition.Capability.TRAINING_READY),
                spec("model.cv.hf-image/v1", AssetKind.MODEL, AssetDirectoryCategory.CV,
                        "HuggingFace 图像分类模型", ArtifactSpecDefinition.Capability.TRAINING_READY),
                spec("model.nlp.package/v1", AssetKind.MODEL, AssetDirectoryCategory.NLP,
                        "NLP 模型包", ArtifactSpecDefinition.Capability.PLANNED),
                spec("dataset.cv.imagefolder/v1", AssetKind.DATASET, AssetDirectoryCategory.CV,
                        "ImageFolder 图像分类数据", ArtifactSpecDefinition.Capability.TRAINING_READY),
                spec("dataset.cv.yolo/v1", AssetKind.DATASET, AssetDirectoryCategory.CV,
                        "YOLO 目标检测数据", ArtifactSpecDefinition.Capability.TRAINING_READY),
                spec("dataset.cv.unlabeled-images/v1", AssetKind.DATASET, AssetDirectoryCategory.CV,
                        "未标注图片", ArtifactSpecDefinition.Capability.STORAGE_ONLY),
                spec("dataset.nlp.documents/v1", AssetKind.DATASET, AssetDirectoryCategory.NLP,
                        "文本数据", ArtifactSpecDefinition.Capability.STORAGE_ONLY),
                spec("dataset.pointcloud.ply-pcd/v1", AssetKind.DATASET, AssetDirectoryCategory.POINT_CLOUD,
                        "PLY/PCD 点云数据", ArtifactSpecDefinition.Capability.STORAGE_ONLY),
                spec("dataset.robot.config-xml-yaml/v1", AssetKind.DATASET, AssetDirectoryCategory.ROBOT,
                        "机器人 XML/YAML 配置", ArtifactSpecDefinition.Capability.STORAGE_ONLY),
                spec("dataset.robot.lerobot/v1", AssetKind.DATASET, AssetDirectoryCategory.ROBOT,
                        "LeRobot 时序数据", ArtifactSpecDefinition.Capability.STORAGE_ONLY),
                spec("dataset.multimodal.directory/v1", AssetKind.DATASET, AssetDirectoryCategory.MULTIMODAL,
                        "多模态目录数据", ArtifactSpecDefinition.Capability.STORAGE_ONLY),
                spec("dataset.multimodal.manifest/v1", AssetKind.DATASET, AssetDirectoryCategory.MULTIMODAL,
                        "多模态 Manifest 数据", ArtifactSpecDefinition.Capability.STORAGE_ONLY)
        ));
    }

    ArtifactSpecRegistry(Collection<ArtifactSpecDefinition> source) {
        LinkedHashMap<String, ArtifactSpecDefinition> loaded = new LinkedHashMap<>();
        for (ArtifactSpecDefinition definition : source) {
            validateDefinition(definition);
            if (loaded.putIfAbsent(definition.id(), definition) != null) {
                throw new IllegalStateException("资产规范ID重复: " + definition.id());
            }
        }
        definitions = Map.copyOf(loaded);
    }

    public List<ArtifactSpecDefinition> list() {
        return definitions.values().stream().sorted(java.util.Comparator.comparing(
                ArtifactSpecDefinition::id
        )).toList();
    }

    public Optional<ArtifactSpecDefinition> find(String specId) {
        if (specId == null || specId.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(definitions.get(specId.trim()));
    }

    public ArtifactSpecDefinition require(String specId) {
        return find(specId).orElseThrow(() -> new IllegalArgumentException("未知资产规范: " + specId));
    }

    private static ArtifactSpecDefinition spec(
            String id,
            AssetKind assetKind,
            AssetDirectoryCategory category,
            String displayName,
            ArtifactSpecDefinition.Capability capability
    ) {
        return new ArtifactSpecDefinition(id, assetKind, category, displayName, capability);
    }

    private void validateDefinition(ArtifactSpecDefinition definition) {
        if (definition == null) {
            throw new IllegalStateException("资产规范不能为空");
        }
        if (definition.id() == null || !SPEC_ID_PATTERN.matcher(definition.id()).matches()) {
            throw new IllegalStateException("资产规范ID非法: " + definition.id());
        }
        if (definition.assetKind() == null || definition.category() == null
                || !definition.category().supports(definition.assetKind())) {
            throw new IllegalStateException("资产规范类别与资产类型不一致: " + definition.id());
        }
        if (definition.displayName() == null || definition.displayName().isBlank()) {
            throw new IllegalStateException("资产规范名称不能为空: " + definition.id());
        }
        if (definition.capability() == null) {
            throw new IllegalStateException("资产规范能力不能为空: " + definition.id());
        }
        String requiredPrefix = definition.assetKind() == AssetKind.MODEL ? "model." : "dataset.";
        if (!definition.id().startsWith(requiredPrefix)) {
            throw new IllegalStateException("资产规范ID与资产类型不一致: " + definition.id());
        }
        if (definition.category() == AssetDirectoryCategory.OTHER) {
            throw new IllegalStateException("OTHER 只能作为目录类别，不能注册为可信资产规范: " + definition.id());
        }
    }
}
