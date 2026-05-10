package com.tss.platform.repository;

import com.tss.platform.entity.DatasetUploadSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DatasetUploadSessionRepository extends JpaRepository<DatasetUploadSession, String> {
    Optional<DatasetUploadSession> findFirstByFileFingerprintAndStatusOrderByUpdatedAtDesc(
            String fileFingerprint,
            String status
    );

    Optional<DatasetUploadSession> findFirstByFileFingerprintAndStatusAndOwnerUserIdOrderByUpdatedAtDesc(
            String fileFingerprint,
            String status,
            Integer ownerUserId
    );
}
