package com.tss.platform.entity;

import com.tss.platform.model.TrainingCodeReviewMode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(name = "platform_system_config")
public class PlatformSystemConfig {

    public static final String GLOBAL_ID = "GLOBAL";

    @Id
    @Column(name = "id", length = 32)
    private String id = GLOBAL_ID;

    @Column(name = "training_code_review_mode", nullable = false, length = 32)
    private String trainingCodeReviewMode = TrainingCodeReviewMode.STANDARD_REVIEW.name();

    @Column(name = "updated_by_user_id")
    private Integer updatedByUserId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
