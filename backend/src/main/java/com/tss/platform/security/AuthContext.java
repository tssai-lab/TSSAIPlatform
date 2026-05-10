package com.tss.platform.security;

import cn.dev33.satoken.stp.StpUtil;
import org.springframework.stereotype.Component;

@Component
public class AuthContext {

    public Integer currentUserId() {
        return StpUtil.getLoginIdAsInt();
    }

    public boolean isAdmin() {
        Object roleValue = StpUtil.getTokenSession().get("roleId");
        if (roleValue instanceof Integer roleId) {
            return roleId == 1 || roleId == 2;
        }
        if (roleValue instanceof Number number) {
            int roleId = number.intValue();
            return roleId == 1 || roleId == 2;
        }
        return false;
    }

    public boolean canAccessOwner(Integer ownerUserId) {
        return isAdmin() || (ownerUserId != null && ownerUserId.equals(currentUserId()));
    }

    public void requireOwnerAccess(Integer ownerUserId, String message) {
        if (!canAccessOwner(ownerUserId)) {
            throw new IllegalArgumentException(message);
        }
    }

    public boolean canAccessObjectName(String objectName, Integer ownerUserId) {
        if (isAdmin()) {
            return true;
        }
        return objectName != null
                && ownerUserId != null
                && ownerUserId.equals(currentUserId())
                && objectName.startsWith(userPrefix(ownerUserId));
    }

    public void requireObjectAccess(String objectName, Integer ownerUserId, String message) {
        if (!canAccessObjectName(objectName, ownerUserId)) {
            throw new IllegalArgumentException(message);
        }
    }

    public String userPrefix(Integer ownerUserId) {
        if (ownerUserId == null) {
            throw new IllegalArgumentException("ownerUserId cannot be null");
        }
        return "users/" + ownerUserId + "/";
    }
}
