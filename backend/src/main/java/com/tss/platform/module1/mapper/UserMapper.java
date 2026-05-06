package com.tss.platform.module1.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.tss.platform.module1.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface UserMapper extends BaseMapper<User> {
    // 自定义联表查询：用户+角色名称（适配前端用户列表展示）
    @Select("SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.deleted_at IS NULL")
    List<Map<String, Object>> selectUserWithRole();
}
