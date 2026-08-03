package com.tss.platform.service;

import com.tss.platform.dto.SystemConfigDto;
import com.tss.platform.dto.SystemConfigUpdateRequest;
import com.tss.platform.entity.PlatformSystemConfig;
import com.tss.platform.model.TrainingCodeReviewMode;
import com.tss.platform.repository.PlatformSystemConfigRepository;
import com.tss.platform.security.AuthContext;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SystemConfigServiceTest {

    private final PlatformSystemConfigRepository repository =
            mock(PlatformSystemConfigRepository.class);
    private final AuthContext authContext = mock(AuthContext.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final SystemConfigService service =
            new SystemConfigService(repository, authContext, entityManager);

    @BeforeEach
    void setUp() {
        when(authContext.isAdmin()).thenReturn(true);
        when(authContext.currentUserId()).thenReturn(9);
        when(repository.saveAndFlush(any(PlatformSystemConfig.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void missingOrInvalidStoredModeFailsClosedToStandardReview() {
        when(repository.findById(PlatformSystemConfig.GLOBAL_ID))
                .thenReturn(Optional.empty());
        assertEquals(
                TrainingCodeReviewMode.STANDARD_REVIEW,
                service.currentTrainingCodeReviewMode()
        );

        PlatformSystemConfig invalid = config("unexpected");
        when(repository.findById(PlatformSystemConfig.GLOBAL_ID))
                .thenReturn(Optional.of(invalid));
        assertEquals(
                TrainingCodeReviewMode.STANDARD_REVIEW,
                service.currentTrainingCodeReviewMode()
        );
    }

    @Test
    void administratorCanSwitchBetweenTheTwoPublicModes() {
        PlatformSystemConfig config = config(
                TrainingCodeReviewMode.STANDARD_REVIEW.name()
        );
        when(repository.findByIdForUpdate(PlatformSystemConfig.GLOBAL_ID))
                .thenReturn(Optional.of(config));

        SystemConfigDto updated = service.updateForAdministration(
                new SystemConfigUpdateRequest("direct_pass", null)
        );

        assertEquals(TrainingCodeReviewMode.DIRECT_PASS.name(),
                updated.trainingCodeReviewMode());
        assertEquals(TrainingCodeReviewMode.DIRECT_PASS.name(),
                config.getTrainingCodeReviewMode());
        assertEquals(9, config.getUpdatedByUserId());
        verify(repository).saveAndFlush(config);
    }

    @Test
    void invalidModeAndNonAdministratorCannotMutateConfiguration() {
        assertThrows(
                IllegalArgumentException.class,
                () -> service.updateForAdministration(
                        new SystemConfigUpdateRequest("SHADOW", null)
                )
        );
        verify(repository, never()).saveAndFlush(any());

        when(authContext.isAdmin()).thenReturn(false);
        assertThrows(
                CodeApprovalForbiddenException.class,
                service::getForAdministration
        );
    }

    private static PlatformSystemConfig config(String mode) {
        Instant now = Instant.parse("2026-07-23T00:00:00Z");
        PlatformSystemConfig config = new PlatformSystemConfig();
        config.setId(PlatformSystemConfig.GLOBAL_ID);
        config.setTrainingCodeReviewMode(mode);
        config.setCreatedAt(now);
        config.setUpdatedAt(now);
        return config;
    }
}
