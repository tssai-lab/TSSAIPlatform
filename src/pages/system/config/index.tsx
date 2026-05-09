import { PageContainer } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import React, { useEffect } from 'react';

/**
 * 系统配置页（仅超管）
 * 纯前端占位：用于承载后续对接后端的系统参数配置。
 */
const SystemConfigPage: React.FC = () => {
  const access = useAccess();

  useEffect(() => {
    if (!access.canAccessSystemConfig) {
      history.replace('/403');
    }
  }, [access.canAccessSystemConfig]);

  if (!access.canAccessSystemConfig) return null;

  return (
    <PageContainer
      title="系统配置"
      subTitle="系统级参数配置（待规划/待对接后端）。"
    ></PageContainer>
  );
};

export default SystemConfigPage;
