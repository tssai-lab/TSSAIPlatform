import { PageContainer } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import { Button, Card, Form, message, Spin, Switch, Typography } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import {
  getTrainingCodeReviewLocalConfig,
  setTrainingCodeReviewLocalConfig,
} from '@/constants/trainingCode';
import {
  fetchSystemConfig,
  type SystemConfig,
  updateSystemConfig,
} from '@/services/system';
import { storage } from '@/utils/storage';

const DEFAULT_CONFIG: SystemConfig = {
  enableAuditLog: true,
  enableTrainingCodeAdminReview: false,
};

const LOCAL_SYSTEM_CONFIG_KEY = 'SYSTEM_CONFIG_LOCAL';

function isNotFoundError(error: unknown): boolean {
  const err = error as {
    response?: { status?: number };
    status?: number;
    message?: string;
  };
  const status = err?.response?.status ?? err?.status;
  if (status === 404) return true;
  return /status code 404|Not Found/i.test(String(err?.message || ''));
}

function readLocalSystemConfig(): SystemConfig {
  const cached = storage.get<Partial<SystemConfig>>(LOCAL_SYSTEM_CONFIG_KEY);
  const review = getTrainingCodeReviewLocalConfig();
  return {
    enableAuditLog: cached?.enableAuditLog ?? DEFAULT_CONFIG.enableAuditLog,
    enableTrainingCodeAdminReview:
      cached?.enableTrainingCodeAdminReview ??
      review.enableTrainingCodeAdminReview ??
      false,
  };
}

function writeLocalSystemConfig(config: SystemConfig) {
  storage.set(LOCAL_SYSTEM_CONFIG_KEY, config);
  setTrainingCodeReviewLocalConfig({
    enableTrainingCodeAdminReview:
      config.enableTrainingCodeAdminReview ?? false,
  });
}

/**
 * 系统配置页（仅超管）
 * 后端 /system/config 未就绪时，训练代码审核等开关落本机缓存仍可生效。
 */
const SystemConfigPage: React.FC = () => {
  const access = useAccess();
  const [form] = Form.useForm<SystemConfig>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);

  useEffect(() => {
    if (!access.canAccessSystemConfig) {
      history.replace('/403');
    }
  }, [access.canAccessSystemConfig]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSystemConfig({ skipErrorHandler: true });
      if (res.code === 200 && res.data) {
        const next: SystemConfig = {
          enableAuditLog: res.data.enableAuditLog ?? true,
          enableTrainingCodeAdminReview:
            res.data.enableTrainingCodeAdminReview ??
            getTrainingCodeReviewLocalConfig().enableTrainingCodeAdminReview,
        };
        form.setFieldsValue(next);
        writeLocalSystemConfig(next);
        setUsingLocalFallback(false);
        return;
      }
      const local = readLocalSystemConfig();
      form.setFieldsValue(local);
      setUsingLocalFallback(true);
    } catch (error: unknown) {
      const local = readLocalSystemConfig();
      form.setFieldsValue(local);
      setUsingLocalFallback(true);
      if (!isNotFoundError(error)) {
        message.warning('系统配置接口暂不可用，已加载本机缓存');
      }
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    if (access.canAccessSystemConfig) {
      loadConfig();
    }
  }, [access.canAccessSystemConfig, loadConfig]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: SystemConfig = {
        enableAuditLog: values.enableAuditLog ?? true,
        enableTrainingCodeAdminReview:
          values.enableTrainingCodeAdminReview ?? false,
      };
      setSaving(true);
      try {
        const res = await updateSystemConfig(payload, {
          skipErrorHandler: true,
        });
        if (res.code === 200) {
          const saved: SystemConfig = {
            enableAuditLog: res.data?.enableAuditLog ?? payload.enableAuditLog,
            enableTrainingCodeAdminReview:
              res.data?.enableTrainingCodeAdminReview ??
              payload.enableTrainingCodeAdminReview,
          };
          form.setFieldsValue(saved);
          writeLocalSystemConfig(saved);
          setUsingLocalFallback(false);
          message.success(res.message || '保存成功');
          return;
        }
      } catch (error: unknown) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
      // 后端未实现配置接口时：本机保存仍生效
      writeLocalSystemConfig(payload);
      form.setFieldsValue(payload);
      setUsingLocalFallback(true);
      message.success('已保存（当前后端未提供系统配置接口，已写入本机）');
    } catch (error: unknown) {
      const values = form.getFieldsValue();
      const payload: SystemConfig = {
        enableAuditLog: values.enableAuditLog ?? true,
        enableTrainingCodeAdminReview:
          values.enableTrainingCodeAdminReview ?? false,
      };
      writeLocalSystemConfig(payload);
      setUsingLocalFallback(true);
      message.success('已保存到本机缓存');
    } finally {
      setSaving(false);
    }
  };

  if (!access.canAccessSystemConfig) return null;

  return (
    <PageContainer
      title="系统配置"
      subTitle="系统级参数配置，仅超级管理员可查看与修改。"
    >
      <Card>
        <Spin spinning={loading}>
          {usingLocalFallback ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
              后端系统配置接口暂不可用（404），当前使用本机缓存；「训练代码管理员审核」开关仍会立即影响前端行为。
            </Typography.Paragraph>
          ) : null}
          <Form
            form={form}
            layout="vertical"
            style={{ maxWidth: 640 }}
            initialValues={DEFAULT_CONFIG}
          >
            <Form.Item
              name="enableAuditLog"
              label="审计日志"
              valuePropName="checked"
              extra="开启后记录关键操作日志。"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item
              name="enableTrainingCodeAdminReview"
              label="训练代码管理员审核"
              valuePropName="checked"
              extra="关闭（默认）：上传/发布新版本后自动审核通过，可直接用于训练。开启：需管理员在「待审核」中人工通过或拒绝。"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={handleSubmit} loading={saving}>
                保存配置
              </Button>
              <Button
                style={{ marginLeft: 8 }}
                onClick={loadConfig}
                disabled={loading || saving}
              >
                重新加载
              </Button>
            </Form.Item>
          </Form>
        </Spin>
      </Card>
    </PageContainer>
  );
};

export default SystemConfigPage;
