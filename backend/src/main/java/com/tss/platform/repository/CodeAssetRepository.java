package com.tss.platform.repository;

import com.tss.platform.entity.CodeAsset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CodeAssetRepository extends JpaRepository<CodeAsset, String> {

    Optional<CodeAsset> findByIdAndDeletedFalse(String id);
}
