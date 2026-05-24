package com.tss.platform.module1.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class ForgetPasswordDTO extends SmsCodeDTO {

    @NotBlank(message = "New password must not be blank")
    @Pattern(regexp = "^\\w{6,16}$", message = "Password must be 6-16 letters, numbers, or underscores")
    private String newPassword;

    @NotBlank(message = "SMS code must not be blank")
    private String smsCode;
}
