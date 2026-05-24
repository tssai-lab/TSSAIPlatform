package com.tss.platform.module1.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.tss.platform.module1.dto.ForgetPasswordDTO;
import com.tss.platform.module1.dto.LoginDTO;
import com.tss.platform.module1.dto.UserRegisterDTO;
import com.tss.platform.module1.entity.User;
import java.util.List;
import java.util.Map;

public interface UserService extends IService<User> {
    // 新增用户（自动加密密码）
    boolean addUser(User user);
    // 重置用户密码
    boolean resetPassword(Integer userId, String newPassword);
    // 查询用户列表（含角色名称）
    List<Map<String, Object>> getUserListWithRole();
    // 软删除用户
    boolean softDeleteUser(Integer userId);
    boolean registerByUsername(UserRegisterDTO dto); // 账号密码注册
    boolean registerByMobile(UserRegisterDTO dto);   // 手机号+验证码注册
    boolean forgetPassword(ForgetPasswordDTO dto);
    Map<String, Object> login(LoginDTO dto);
}
