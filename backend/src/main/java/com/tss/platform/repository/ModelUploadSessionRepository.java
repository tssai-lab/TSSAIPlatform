package com.tss.platform.repository;

import com.tss.platform.entity.ModelUploadSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ModelUploadSessionRepository extends JpaRepository<ModelUploadSession, String> {
    Optional<ModelUploadSession> findFirstByFileFingerprintAndStatusOrderByUpdatedAtDesc(
            String fileFingerprint,
            String status
    );

    Optional<ModelUploadSession> findFirstByFileFingerprintAndStatusAndOwnerUserIdOrderByUpdatedAtDesc(
            String fileFingerprint,
            String status,
            Integer ownerUserId
    );
}
