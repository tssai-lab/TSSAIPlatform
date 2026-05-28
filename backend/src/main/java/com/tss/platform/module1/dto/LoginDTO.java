package com.tss.platform.module1.dto;

import lombok.Data;

@Data
public class LoginDTO {

    private String username;

    private String password;

    private String mobile;

    private String smsCode;

    private Integer roleId = 3;

    private String type; // account 或 mobile
}