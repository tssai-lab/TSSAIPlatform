package com.tss.platform.module1.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class SmsCodeDTO {
    @NotBlank(message = "Mobile must not be blank")
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "Invalid mobile format")
    private String mobile;
}
