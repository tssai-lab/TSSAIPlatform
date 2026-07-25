package com.tss.platform.service;

import com.tss.platform.dto.SystemConfigDto;
import com.tss.platform.dto.SystemConfigUpdateRequest;
import com.tss.platform.entity.PlatformSystemConfig;
import com.tss.platform.model.TrainingCodeReviewMode;
import com.tss.platform.repository.PlatformSystemConfigRepository;
import com.tss.platform.security.AuthContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class SystemConfigService {

    private static final Logger log = LoggerFactory.getLogger(SystemConfigService.class);

    private final PlatformSystemConfigRepository repository;
    private final AuthContext authContext;

    public SystemConfigService(
            PlatformSystemConfigRepository repository,
            AuthContext authContext
    ) {
        this.repository = repository;
        this.authContext = authContext;
    }

    @Transactional(readOnly = true)
    public TrainingCodeReviewMode currentTrainingCodeReviewMode() {
        return repository.findById(PlatformSystemConfig.GLOBAL_ID)
                .map(PlatformSystemConfig::getTrainingCodeReviewMode)
                .map(SystemConfigService::storedModeOrFailClosed)
                .orElse(TrainingCodeReviewMode.STANDARD_REVIEW);
    }

    @Transactional(readOnly = true)
    public SystemConfigDto getForAdministration() {
        requireAdministratorAuthority();
        return repository.findById(PlatformSystemConfig.GLOBAL_ID)
                .map(SystemConfigService::toDto)
                .orElseGet(() -> new SystemConfigDto(
                        TrainingCodeReviewMode.STANDARD_REVIEW.name(),
                        null
                ));
    }

    @Transactional
    public SystemConfigDto updateForAdministration(SystemConfigUpdateRequest request) {
        requireAdministratorAuthority();
        TrainingCodeReviewMode requested = TrainingCodeReviewMode.fromApiValue(
                request == null ? null : request.trainingCodeReviewMode()
        );
        Integer operatorUserId = authContext.currentUserId();
        Instant now = Instant.now();
        PlatformSystemConfig config = repository
                .findByIdForUpdate(PlatformSystemConfig.GLOBAL_ID)
                .orElseGet(() -> newConfig(now));
        String previous = config.getTrainingCodeReviewMode();
        config.setTrainingCodeReviewMode(requested.name());
        config.setUpdatedByUserId(operatorUserId);
        config.setUpdatedAt(now);
        PlatformSystemConfig saved = repository.saveAndFlush(config);
        log.info(
                "Training code review mode updated: previous={}, current={}, operatorUserId={}",
                previous,
                requested,
                operatorUserId
        );
        return toDto(saved);
    }

    private void requireAdministratorAuthority() {
        try {
            if (authContext.isAdmin()) {
                return;
            }
        } catch (RuntimeException ignored) {
            // Keep authentication-provider details out of the public response.
        }
        throw new CodeApprovalForbiddenException();
    }

    private static PlatformSystemConfig newConfig(Instant now) {
        PlatformSystemConfig config = new PlatformSystemConfig();
        config.setId(PlatformSystemConfig.GLOBAL_ID);
        config.setCreatedAt(now);
        config.setUpdatedAt(now);
        return config;
    }

    private static TrainingCodeReviewMode storedModeOrFailClosed(String value) {
        try {
            return TrainingCodeReviewMode.fromApiValue(value);
        } catch (IllegalArgumentException exception) {
            return TrainingCodeReviewMode.STANDARD_REVIEW;
        }
    }

    private static SystemConfigDto toDto(PlatformSystemConfig config) {
        return new SystemConfigDto(
                storedModeOrFailClosed(config.getTrainingCodeReviewMode()).name(),
                config.getUpdatedAt()
        );
    }
}
