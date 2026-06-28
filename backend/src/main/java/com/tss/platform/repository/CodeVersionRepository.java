package com.tss.platform.repository;

import com.tss.platform.entity.CodeVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CodeVersionRepository extends JpaRepository<CodeVersion, String> {

    Optional<CodeVersion> findByIdAndDeletedFalse(String id);
}
