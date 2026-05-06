package com.tss.platform.module1.util;

import org.apache.commons.lang3.RandomStringUtils;
import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component // 交给Spring管理，可注入
public class SmsCodeUtil {

    // 内存缓存验证码：key=手机号，value=6位验证码
    private static final Map<String, String> CODE_CACHE = new ConcurrentHashMap<>();
    // 内存缓存发送时间：key=手机号，value=发送时间戳（秒）
    private static final Map<String, Long> TIME_CACHE = new ConcurrentHashMap<>();

    private static final long EXPIRE = 300; // 验证码5分钟过期（300秒）
    private static final long LIMIT = 60;   // 60秒防刷（同一手机号只能发一次）

    // 生成6位数字验证码
    public String genCode() {
        return RandomStringUtils.randomNumeric(6);
    }

    // 保存验证码到内存
    public void save(String mobile, String code) {
        CODE_CACHE.put(mobile, code);
        TIME_CACHE.put(mobile, System.currentTimeMillis() / 1000);
    }

    // 校验验证码（是否存在、是否过期、是否匹配）
    public boolean check(String mobile, String code) {
        String realCode = CODE_CACHE.get(mobile);
        Long sendTime = TIME_CACHE.get(mobile);

        // 1. 验证码不存在/发送时间不存在 → 无效
        if (realCode == null || sendTime == null) return false;
        // 2. 验证码超过5分钟 → 无效
        if (System.currentTimeMillis() / 1000 - sendTime > EXPIRE) return false;
        // 3. 输入的验证码不匹配 → 无效
        if (!realCode.equals(code)) return false;

        // 验证通过，删除缓存（防止重复使用）
        CODE_CACHE.remove(mobile);
        TIME_CACHE.remove(mobile);
        return true;
    }

    // 检查是否60秒内重复发送
    public boolean isLimited(String mobile) {
        Long sendTime = TIME_CACHE.get(mobile);
        return sendTime != null && (System.currentTimeMillis() / 1000 - sendTime) < LIMIT;
    }
}
