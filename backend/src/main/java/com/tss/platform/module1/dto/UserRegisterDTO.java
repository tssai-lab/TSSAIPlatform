package com.tss.platform.module1.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UserRegisterDTO {

    @Size(min = 6, max = 20, message = "Username must be 6-20 characters")
    private String username;

    @NotBlank(message = "Password must not be blank")
    @Pattern(regexp = "^\\w{6,16}$", message = "Password must be 6-16 letters, numbers, or underscores")
    private String password;

    @NotBlank(message = "Confirm password must not be blank")
    private String confirmPassword;

    private String mobile;

    private String smsCode;

    private Integer roleId = 3;
}
