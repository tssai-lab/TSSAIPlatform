package com.tss.platform.training.plan;

import com.tss.platform.asset.spec.ArtifactSpecRegistry;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class AcceptanceBundleTrainingPlanTest {

    private final TrainingPlanYamlParser parser = new TrainingPlanYamlParser();
    private final TrainingPlanValidator validator = new TrainingPlanValidator(new ArtifactSpecRegistry());

    @Test
    void acceptsCpuCvAndNlpAcceptancePlans() throws IOException {
        validate(readRepositoryFile(
                "examples/acceptance/yolov11n_object_detection/yolov11n_object_detection_cpu-v1.yaml"
        ));
        validate(Files.readAllBytes(Path.of(
                "src/main/resources/training-plans/minirbt_text_classification-v1.yaml"
        )));
    }

    private void validate(byte[] yaml) {
        TrainingPlanDefinition plan = parser.parse(yaml, "cpu-acceptance-plan.yaml");
        assertDoesNotThrow(() -> validator.validate(plan, "cpu-acceptance-plan.yaml"));
    }

    private byte[] readRepositoryFile(String relativePath) throws IOException {
        Path fromModule = Path.of("..", relativePath);
        Path fromRepository = Path.of(relativePath);
        return Files.readAllBytes(Files.isRegularFile(fromModule) ? fromModule : fromRepository);
    }
}
