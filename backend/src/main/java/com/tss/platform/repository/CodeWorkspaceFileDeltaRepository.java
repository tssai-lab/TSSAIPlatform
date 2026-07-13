package com.tss.platform.repository;

import com.tss.platform.entity.CodeWorkspaceFileDelta;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CodeWorkspaceFileDeltaRepository
        extends JpaRepository<CodeWorkspaceFileDelta, String> {

    List<CodeWorkspaceFileDelta> findByWorkspaceIdOrderByPathAsc(String workspaceId);

    Optional<CodeWorkspaceFileDelta> findByWorkspaceIdAndPath(String workspaceId, String path);
}
