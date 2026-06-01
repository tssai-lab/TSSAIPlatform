package com.tss.platform.module1.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserRegisterDTO {

    @Size(min = 6, max = 20, message = "用户名6-20位字符")
    private String username;

    @NotBlank(message = "密码不能为空")
    @Pattern(regexp = "^\\w{6,16}$", message = "密码6-16位字母/数字/下划线")
    private String password;

    @NotBlank(message = "确认密码不能为空")
    private String confirmPassword;

    private String mobile;

    private String smsCode;

    private Integer roleId = 3;
}