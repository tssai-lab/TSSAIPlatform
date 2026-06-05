import { PageContainer } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import { Button, Card, Form, message, Spin, Switch, Typography } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchSystemConfig,
  type SystemConfig,
  updateSystemConfig,
} from '@/services/system';
import { notifyRequestError } from '../notifyRequestError';

/**
 * 系统配置页（仅超管）
 */
const SystemConfigPage: React.FC = () => {
  const access = useAccess();
  const [form] = Form.useForm<SystemConfig>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
        form.setFieldsValue({
          enableAuditLog: res.data.enableAuditLog ?? true,
        });
      } else {
        message.error(res.message || '加载配置失败');
      }
    } catch (error: unknown) {
      notifyRequestError(error, '加载配置失败');
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
      setSaving(true);
      const res = await updateSystemConfig(values);
      if (res.code === 200) {
        message.success(res.message || '保存成功');
        if (res.data) {
          form.setFieldsValue({
            enableAuditLog: res.data.enableAuditLog ?? values.enableAuditLog,
          });
        }
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (error: unknown) {
      notifyRequestError(error, '保存失败');
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
          <Form
            form={form}
            layout="vertical"
            style={{ maxWidth: 560 }}
            initialValues={{ enableAuditLog: true }}
          >
            <Form.Item
              name="enableAuditLog"
              label="审计日志"
              valuePropName="checked"
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
          <Typography.Text type="secondary">待后续与团队沟通</Typography.Text>
        </Spin>
      </Card>
    </PageContainer>
  );
};

export default SystemConfigPage;
