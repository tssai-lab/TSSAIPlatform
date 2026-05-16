package com.tss.platform.module1.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.tss.platform.module1.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface UserMapper extends BaseMapper<User> {
    @Select("SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.deleted_at IS NULL")
    List<Map<String, Object>> selectUserWithRole();

    IPage<Map<String, Object>> selectUserPage(Page<Map<String, Object>> page, @Param("query") UserQueryDTO queryDTO);

    @Select("SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = #{userId} AND u.deleted_at IS NULL")
    Map<String, Object> selectUserDetail(@Param("userId") Integer userId);
}
