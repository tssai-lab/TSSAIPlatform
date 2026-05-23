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

    /** 仅校验，不消耗验证码（业务成功后再调用 {@link #consume}） */
    public boolean verify(String mobile, String code) {
        if (mobile == null || code == null) {
            return false;
        }
        String realCode = CODE_CACHE.get(mobile.trim());
        Long sendTime = TIME_CACHE.get(mobile.trim());
        if (realCode == null || sendTime == null) {
            return false;
        }
        if (System.currentTimeMillis() / 1000 - sendTime > EXPIRE) {
            return false;
        }
        return realCode.equals(code.trim());
    }

    /** 校验通过后消耗验证码 */
    public void consume(String mobile) {
        if (mobile == null) {
            return;
        }
        String key = mobile.trim();
        CODE_CACHE.remove(key);
        TIME_CACHE.remove(key);
    }

    /** 校验并立即消耗（登录等一次性场景） */
    public boolean check(String mobile, String code) {
        if (!verify(mobile, code)) {
            return false;
        }
        consume(mobile);
        return true;
    }

    // 检查是否60秒内重复发送
    public boolean isLimited(String mobile) {
        Long sendTime = TIME_CACHE.get(mobile);
        return sendTime != null && (System.currentTimeMillis() / 1000 - sendTime) < LIMIT;
    }
}
