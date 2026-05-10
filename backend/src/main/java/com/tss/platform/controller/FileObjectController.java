package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.security.AuthContext;
import com.tss.platform.service.MinioService;
import io.minio.StatObjectResponse;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/files")
public class FileObjectController {

    private final MinioService minioService;
    private final AuthContext authContext;

    public FileObjectController(MinioService minioService, AuthContext authContext) {
        this.minioService = minioService;
        this.authContext = authContext;
    }

    @GetMapping("/health")
    public ApiResponse<Map<String, Object>> health() {
        try {
            minioService.assertConnected();
            Map<String, Object> data = new HashMap<>();
            data.put("minio", "ok");
            return ApiResponse.ok(data);
        } catch (Exception e) {
            return ApiResponse.fail("MinIO 连接失败: " + e.getMessage());
        }
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "objectName", required = false) String objectName
    ) {
        try {
            String name = (objectName == null || objectName.isBlank()) ? file.getOriginalFilename() : objectName;
            if (name == null || name.isBlank()) {
                return ApiResponse.fail("objectName 不能为空");
            }
            name = normalizeUserObjectName(name);
            minioService.uploadFile(name, file);
            StatObjectResponse stat = minioService.stat(name);
            Map<String, Object> data = new HashMap<>();
            data.put("objectName", name);
            data.put("size", stat.size());
            data.put("etag", stat.etag());
            return ApiResponse.ok(data);
        } catch (Exception e) {
            return ApiResponse.fail("上传失败: " + e.getMessage());
        }
    }

    @GetMapping("/download")
    public ResponseEntity<?> download(@RequestParam("objectName") String objectName) {
        try {
            requireObjectAccess(objectName);
            StatObjectResponse stat = minioService.stat(objectName);
            InputStream is = minioService.downloadStream(objectName);
            String filename = objectName.contains("/") ? objectName.substring(objectName.lastIndexOf('/') + 1) : objectName;
            String encoded = URLEncoder.encode(filename, StandardCharsets.UTF_8);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encoded)
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(stat.size())
                    .body(new InputStreamResource(is));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(ApiResponse.fail("文件不存在或下载失败: " + e.getMessage()));
        }
    }

    @DeleteMapping("/delete")
    public ApiResponse<Map<String, Object>> delete(@RequestParam("objectName") String objectName) {
        try {
            requireObjectAccess(objectName);
            minioService.deleteObject(objectName);
            Map<String, Object> data = new HashMap<>();
            data.put("objectName", objectName);
            data.put("deleted", true);
            return ApiResponse.ok(data);
        } catch (Exception e) {
            return ApiResponse.fail("删除失败: " + e.getMessage());
        }
    }
    private String normalizeUserObjectName(String objectName) {
        if (authContext.isAdmin()) {
            return objectName;
        }
        String prefix = currentUserPrefix();
        if (objectName.startsWith(prefix)) {
            return objectName;
        }
        String cleanName = objectName.replace('\\', '/').replaceAll("^/+", "");
        return prefix + "files/" + cleanName;
    }

    private void requireObjectAccess(String objectName) {
        if (authContext.isAdmin()) {
            return;
        }
        if (objectName == null || !objectName.startsWith(currentUserPrefix())) {
            throw new IllegalArgumentException("object not found or no permission");
        }
    }

    private String currentUserPrefix() {
        return "users/" + authContext.currentUserId() + "/";
    }
}

