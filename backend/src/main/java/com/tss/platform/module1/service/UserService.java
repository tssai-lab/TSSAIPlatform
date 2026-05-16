package com.tss.platform.module1.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.tss.platform.module1.dto.ForgetPasswordDTO;
import com.tss.platform.module1.dto.LoginDTO;
import com.tss.platform.module1.dto.UserRegisterDTO;
import com.tss.platform.module1.entity.User;
import java.util.List;
import java.util.Map;

public interface UserService extends IService<User> {
    boolean addUser(User user);
    boolean resetPassword(Integer userId, String newPassword);
    List<Map<String, Object>> getUserListWithRole();
    boolean softDeleteUser(Integer userId);
    boolean registerByUsername(UserRegisterDTO dto);
    boolean registerByMobile(UserRegisterDTO dto);
    boolean forgetPassword(ForgetPasswordDTO dto);
    Map<String, Object> login(LoginDTO dto);
    boolean promoteToNormalAdmin(Integer targetUserId);

    IPage<Map<String, Object>> getUserPage(UserQueryDTO queryDTO);
    Map<String, Object> getUserDetail(Integer userId);
    boolean updateUser(UserUpdateDTO updateDTO);
    boolean toggleUserStatus(Integer userId, Boolean status);
}
