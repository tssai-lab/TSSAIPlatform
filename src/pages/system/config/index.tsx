import { PageContainer } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import {
  Button,
  Card,
  Form,
  InputNumber,
  message,
  Spin,
  Switch,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import {
  getTrainingCodeReviewLocalConfig,
  setTrainingCodeReviewLocalConfig,
} from '@/constants/trainingCode';
import {
  DEFAULT_USER_LOG_LIMIT_MB,
  fetchSystemConfig,
  MAX_USER_LOG_LIMIT_MB,
  MIN_USER_LOG_LIMIT_MB,
  type SystemConfig,
  updateSystemConfig,
} from '@/services/system/config';
import { storage } from '@/utils/storage';

const DEFAULT_CONFIG: SystemConfig = {
  enableTrainingCodeAdminReview: false,
  trainingCodeReviewMode: 'DIRECT_PASS',
  userLogStorageLimitMb: DEFAULT_USER_LOG_LIMIT_MB,
  logMaxSize: DEFAULT_USER_LOG_LIMIT_MB,
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
  const limitMb =
    cached?.userLogStorageLimitMb ??
    cached?.logMaxSize ??
    DEFAULT_USER_LOG_LIMIT_MB;
  const enableReview =
    cached?.enableTrainingCodeAdminReview ??
    review.enableTrainingCodeAdminReview ??
    false;
  return {
    enableTrainingCodeAdminReview: enableReview,
    trainingCodeReviewMode: enableReview ? 'STANDARD_REVIEW' : 'DIRECT_PASS',
    userLogStorageLimitMb: limitMb,
    logMaxSize: limitMb,
    updatedAt: cached?.updatedAt,
  };
}

function writeLocalSystemConfig(config: SystemConfig) {
  storage.set(LOCAL_SYSTEM_CONFIG_KEY, config);
  setTrainingCodeReviewLocalConfig({
    enableTrainingCodeAdminReview:
      config.enableTrainingCodeAdminReview ?? false,
  });
}

function formatUpdatedAt(value?: string) {
  if (!value) return '-';
  return value.replace('T', ' ').replace('Z', ' UTC').slice(0, 23);
}

/**
 * 系统配置页（仅超管）
 * 对齐后端：trainingCodeReviewMode、logMaxSize / userLogStorageLimitMb、updatedAt
 */
const SystemConfigPage: React.FC = () => {
  const access = useAccess();
  const [form] = Form.useForm<SystemConfig>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>();

  useEffect(() => {
    if (!access.canAccessSystemConfig) {
      history.replace('/403');
    }
  }, [access.canAccessSystemConfig]);

  const applyConfig = useCallback(
    (next: SystemConfig) => {
      form.setFieldsValue(next);
      setUpdatedAt(next.updatedAt);
      writeLocalSystemConfig(next);
    },
    [form],
  );

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSystemConfig({ skipErrorHandler: true });
      if (res.code === 200 && res.data) {
        applyConfig(res.data);
        setUsingLocalFallback(false);
        return;
      }
      applyConfig(readLocalSystemConfig());
      setUsingLocalFallback(true);
    } catch (error: unknown) {
      applyConfig(readLocalSystemConfig());
      setUsingLocalFallback(true);
      if (!isNotFoundError(error)) {
        message.warning('系统配置接口暂不可用，已加载本机缓存');
      }
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    if (access.canAccessSystemConfig) {
      void loadConfig();
    }
  }, [access.canAccessSystemConfig, loadConfig]);

  const buildPayload = (values: SystemConfig): SystemConfig => {
    const limitMb =
      values.userLogStorageLimitMb ??
      values.logMaxSize ??
      DEFAULT_USER_LOG_LIMIT_MB;
    const enableReview = values.enableTrainingCodeAdminReview ?? false;
    return {
      enableTrainingCodeAdminReview: enableReview,
      trainingCodeReviewMode: enableReview ? 'STANDARD_REVIEW' : 'DIRECT_PASS',
      userLogStorageLimitMb: limitMb,
      logMaxSize: limitMb,
    };
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = buildPayload(values);
      setSaving(true);
      try {
        const res = await updateSystemConfig(payload, {
          skipErrorHandler: true,
        });
        if (res.code === 200) {
          applyConfig(res.data ?? payload);
          setUsingLocalFallback(false);
          message.success(res.message || '保存成功');
          return;
        }
      } catch (error: unknown) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
      applyConfig(payload);
      setUsingLocalFallback(true);
      message.success('已保存（当前后端未提供系统配置接口，已写入本机）');
    } catch {
      applyConfig(buildPayload(form.getFieldsValue()));
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
              后端系统配置接口暂不可用，当前使用本机缓存；「训练代码管理员审核」开关仍会立即影响前端行为。
            </Typography.Paragraph>
          ) : null}
          <Form
            form={form}
            layout="vertical"
            style={{ maxWidth: 640 }}
            initialValues={DEFAULT_CONFIG}
          >
            <Form.Item
              name="enableTrainingCodeAdminReview"
              label="训练代码管理员审核"
              valuePropName="checked"
              extra="关闭（默认）：上传/发布新版本后自动审核通过，可直接用于训练。开启：需管理员在「待审核」中人工通过或拒绝。"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item
              name="userLogStorageLimitMb"
              label="每用户日志容量上限"
              extra={`单位 MB。默认 ${DEFAULT_USER_LOG_LIMIT_MB}，范围 ${MIN_USER_LOG_LIMIT_MB}～${MAX_USER_LOG_LIMIT_MB}。`}
              rules={[
                { required: true, message: '请输入每用户日志容量上限' },
                {
                  type: 'number',
                  min: MIN_USER_LOG_LIMIT_MB,
                  max: MAX_USER_LOG_LIMIT_MB,
                  message: `请输入 ${MIN_USER_LOG_LIMIT_MB}～${MAX_USER_LOG_LIMIT_MB} 之间的整数`,
                },
              ]}
            >
              <InputNumber
                min={MIN_USER_LOG_LIMIT_MB}
                max={MAX_USER_LOG_LIMIT_MB}
                step={1}
                precision={0}
                addonAfter="MB"
                style={{ width: 240 }}
                placeholder={String(DEFAULT_USER_LOG_LIMIT_MB)}
              />
            </Form.Item>
            <Form.Item label="最近更新时间">
              <Typography.Text type="secondary">
                {formatUpdatedAt(updatedAt)}
              </Typography.Text>
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={handleSubmit} loading={saving}>
                保存配置
              </Button>
              <Button
                style={{ marginLeft: 8 }}
                onClick={() => void loadConfig()}
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
