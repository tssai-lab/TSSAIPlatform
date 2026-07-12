import 'swagger-ui-react/swagger-ui.css';

import { ReloadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SwaggerUI from 'swagger-ui-react';
import { STORAGE_KEYS, storage } from '@/utils/storage';

import { METHOD_TAG_COLOR, MODULE_ORDER, TAG_MODULE_MAP } from './constants';

// ==================== 类型定义 ====================

interface EndpointInfo {
  method: string;
  path: string;
  summary: string;
}

interface SpecData {
  info?: { title?: string; version?: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths?: Record<string, Record<string, any>>;
}

// ==================== 辅助函数 ====================

/**
 * 从 paths 中提取所有唯一 controller tag，映射为中文模块名后去重排序。
 * 后端（SpringDoc）没有顶层 tags 数组，模块信息只能从每个接口的 tags[0] 推导。
 */
function deriveModules(
  spec: SpecData | null,
): Array<{ name: string; description: string }> {
  if (!spec?.paths) return [];

  // 收集所有原始 controller tag → 模块名的映射
  const controllerToModule: Record<string, string> = {};
  for (const methods of Object.values(spec.paths)) {
    for (const detail of Object.values(methods)) {
      const rawTag: string | undefined = detail.tags?.[0];
      if (!rawTag) continue;
      const moduleInfo = TAG_MODULE_MAP[rawTag];
      const moduleName = moduleInfo?.name || '';
      if (moduleName && !controllerToModule[rawTag]) {
        controllerToModule[rawTag] = moduleName;
      }
    }
  }

  // 收集每个模块的描述（取第一个有描述的）
  const moduleDesc: Record<string, string> = {};
  for (const [controller, moduleName] of Object.entries(controllerToModule)) {
    const info = TAG_MODULE_MAP[controller];
    if (info?.description && !moduleDesc[moduleName]) {
      moduleDesc[moduleName] = info.description;
    }
  }

  // 按 MODULE_ORDER 排序，不在列表中的放最后
  const orderIndex: Record<string, number> = {};
  MODULE_ORDER.forEach((m, i) => {
    orderIndex[m] = i;
  });

  const uniqueModules = [...new Set(Object.values(controllerToModule))];
  uniqueModules.sort((a, b) => {
    const ai = orderIndex[a] ?? MODULE_ORDER.length;
    const bi = orderIndex[b] ?? MODULE_ORDER.length;
    return ai - bi;
  });

  return uniqueModules.map((name) => ({
    name,
    description: moduleDesc[name] || '暂无描述',
  }));
}

/**
 * 将接口按中文模块名分组。
 * 一个接口的原始 controller tag 通过 TAG_MODULE_MAP 映射为模块名，同模块的所有接口合并。
 */
function groupEndpointsByModule(
  spec: SpecData | null,
): Record<string, EndpointInfo[]> {
  const groups: Record<string, EndpointInfo[]> = {};
  if (!spec?.paths) return groups;
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, detail] of Object.entries(methods)) {
      if (
        !['get', 'post', 'put', 'delete', 'patch'].includes(
          method.toLowerCase(),
        )
      )
        continue;
      const rawTag: string | undefined = detail.tags?.[0];
      const moduleName = rawTag ? TAG_MODULE_MAP[rawTag]?.name || '' : '';
      const target = moduleName || '其他';
      if (!groups[target]) groups[target] = [];
      groups[target].push({
        method: method.toUpperCase(),
        path,
        summary: detail.summary || detail.operationId || path,
      });
    }
  }
  return groups;
}

function getBaseUrl(spec: SpecData | null): string {
  return spec?.servers?.[0]?.url || '/api';
}

// ==================== 子组件 ====================

const HttpMethodTag: React.FC<{ method: string }> = ({ method }) => {
  const m = METHOD_TAG_COLOR[method] ?? { color: 'default', text: method };
  return (
    <Tag
      color={m.color}
      style={{
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: '18px',
        margin: 0,
      }}
    >
      {m.text}
    </Tag>
  );
};

/** Swagger UI 主题覆盖 — 注入自定义 CSS 匹配 Ant Design 风格 */
function useSwaggerTheme() {
  useEffect(() => {
    const styleId = 'swagger-ui-theme-override';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .swagger-ui {
        font-family: AlibabaSans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .swagger-ui .opblock {
        border: 1px solid #f0f0f0;
        border-radius: 6px;
        box-shadow: none;
      }
      .swagger-ui .opblock .opblock-summary-method {
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        min-width: 60px;
        text-align: center;
        padding: 3px 8px;
      }
      .swagger-ui .opblock-tag {
        font-size: 15px;
        font-weight: 600;
        border-bottom: 1px solid #f0f0f0;
      }
      .swagger-ui .opblock-tag:hover {
        background: transparent;
      }
      .swagger-ui input, .swagger-ui textarea, .swagger-ui select {
        border: 1px solid #d9d9d9;
        border-radius: 6px;
      }
      .swagger-ui input:focus, .swagger-ui textarea:focus, .swagger-ui select:focus {
        border-color: #1890ff;
        box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
        outline: none;
      }
      .swagger-ui .btn {
        border-radius: 6px;
        font-size: 14px;
        padding: 4px 15px;
        height: 32px;
        border: 1px solid #d9d9d9;
        cursor: pointer;
        font-family: inherit;
      }
      .swagger-ui .btn.execute {
        background: #1890ff;
        border-color: #1890ff;
        color: #fff;
      }
      .swagger-ui .btn.execute:hover {
        background: #4096ff;
        border-color: #4096ff;
      }
      .swagger-ui .btn.cancel {
        background: #fff;
        border-color: #d9d9d9;
      }
      .swagger-ui .btn.authorize {
        background: #fff;
        border-color: #d9d9d9;
        color: #1890ff;
      }
      .swagger-ui .btn.authorize:hover {
        border-color: #1890ff;
      }
      .swagger-ui section.models {
        border: 1px solid #f0f0f0;
        border-radius: 6px;
      }
      .swagger-ui .model-box {
        background: #fafafa;
        border-radius: 4px;
      }
      .swagger-ui .dialog-ux .modal-ux {
        border-radius: 8px;
      }
      .swagger-ui table thead tr td, .swagger-ui table thead tr th {
        border-bottom: 1px solid #f0f0f0;
      }
      .swagger-ui .info .title {
        font-family: AlibabaSans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);
}

// ==================== 主页面 ====================

const ApiDoc: React.FC = () => {
  const [spec, setSpec] = useState<SpecData | null>(null);
  const [specLoading, setSpecLoading] = useState(true);
  const [specError, setSpecError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');

  useSwaggerTheme();

  const fetchSpec = useCallback(async () => {
    setSpecLoading(true);
    setSpecError(null);
    try {
      const res = await fetch('/v3/api-docs', {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SpecData = await res.json();
      setSpec(data);
    } catch (err: any) {
      setSpecError(err?.message || '获取 API 文档失败');
    } finally {
      setSpecLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpec();
  }, [fetchSpec]);

  const modules = useMemo(() => deriveModules(spec), [spec]);
  const endpointsByModule = useMemo(() => groupEndpointsByModule(spec), [spec]);
  const baseUrl = useMemo(() => getBaseUrl(spec), [spec]);

  const requestInterceptor = useCallback((req: any) => {
    const token = storage.get<string>(STORAGE_KEYS.TOKEN);
    if (token && req.headers) {
      req.headers.Authorization = `Bearer ${token}`;
    }
    return req;
  }, []);

  // ==================== 错误状态 ====================

  if (specError) {
    return (
      <PageContainer ghost title="OpenAPI 文档" style={{ maxWidth: 'none' }}>
        <Card>
          <Alert
            type="error"
            showIcon
            message="加载 API 文档失败"
            description={specError}
            action={
              <Button size="small" danger onClick={fetchSpec}>
                重新加载
              </Button>
            }
          />
        </Card>
      </PageContainer>
    );
  }

  // ==================== 正常渲染 ====================

  return (
    <PageContainer
      ghost
      title="OpenAPI 文档"
      subTitle="查看并调试平台所有后端接口"
      style={{ maxWidth: 'none' }}
      extra={
        <Button
          onClick={fetchSpec}
          loading={specLoading}
          icon={<ReloadOutlined />}
        >
          刷新文档
        </Button>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'overview',
            label: 'API 概览',
            children: (
              <>
                {/* 第 1 节：API 信息横幅 */}
                <Card style={{ marginBottom: 16 }}>
                  <Row align="top" wrap>
                    <Col flex="auto">
                      <Typography.Title level={3} style={{ marginBottom: 8 }}>
                        {spec?.info?.title || 'AI 训练平台 API'}
                      </Typography.Title>
                      <Space wrap size={[8, 8]} style={{ marginBottom: 8 }}>
                        {spec?.info?.version && (
                          <Tag color="processing">v{spec.info.version}</Tag>
                        )}
                        <Tag color="blue">OpenAPI 3.0</Tag>
                        <Tag color="green">RESTful</Tag>
                      </Space>
                      <Typography.Paragraph
                        style={{ color: 'rgba(0,0,0,0.65)', marginBottom: 0 }}
                      >
                        {spec?.info?.description ||
                          '本平台提供模型管理、数据集管理、训练调度、模型推理等核心业务接口，所有接口遵循 RESTful 规范，统一返回 JSON 格式数据。'}
                      </Typography.Paragraph>
                    </Col>
                  </Row>
                </Card>

                {/* 第 2 节：连接信息 */}
                <Alert
                  type="info"
                  showIcon
                  message="连接信息"
                  description={
                    <Descriptions
                      size="small"
                      column={{ xs: 1, sm: 2, md: 4 }}
                      style={{ marginTop: 8 }}
                    >
                      <Descriptions.Item label="接口地址">
                        <Typography.Text code copyable>
                          {baseUrl}
                        </Typography.Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="认证方式">
                        <Tag color="blue">Bearer Token</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="文档规范">
                        <Typography.Text code>/v3/api-docs</Typography.Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="接口协议">
                        <Tag color="green">RESTful</Tag>
                      </Descriptions.Item>
                    </Descriptions>
                  }
                  style={{ marginBottom: 16 }}
                />

                {/* 第 3 节：模块卡片 */}
                <Typography.Title level={5} style={{ marginBottom: 12 }}>
                  接口模块概览（共 {modules.length} 个模块）
                </Typography.Title>

                {modules.length === 0 ? (
                  <Empty
                    description="暂未获取到 API 模块信息"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                ) : (
                  <Row gutter={[12, 12]}>
                    {modules.map((mod) => {
                      const endpoints = endpointsByModule[mod.name] || [];
                      return (
                        <Col xs={24} sm={12} md={8} lg={6} key={mod.name}>
                          <Card
                            size="small"
                            title={mod.name}
                            hoverable
                            styles={{
                              header: {
                                minHeight: 38,
                                padding: '0 14px',
                                fontSize: 14,
                              },
                              body: { padding: '12px 14px' },
                            }}
                            onClick={() => {
                              setActiveTab('swagger');
                            }}
                          >
                            <Typography.Paragraph
                              ellipsis={{ rows: 2 }}
                              style={{
                                marginBottom: 12,
                                fontSize: 13,
                                color: 'rgba(0,0,0,0.65)',
                                minHeight: 36,
                              }}
                            >
                              {mod.description}
                            </Typography.Paragraph>
                            <Space size={[4, 6]} wrap>
                              {endpoints.length === 0 ? (
                                <Typography.Text
                                  type="secondary"
                                  style={{ fontSize: 12 }}
                                >
                                  暂无接口
                                </Typography.Text>
                              ) : (
                                endpoints
                                  .slice(0, 4)
                                  .map((ep) => (
                                    <HttpMethodTag
                                      key={ep.method + ep.path}
                                      method={ep.method}
                                    />
                                  ))
                              )}
                              {endpoints.length > 4 && (
                                <Typography.Text
                                  type="secondary"
                                  style={{ fontSize: 12 }}
                                >
                                  +{endpoints.length - 4} 个接口
                                </Typography.Text>
                              )}
                            </Space>
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                )}
              </>
            ),
          },
          {
            key: 'swagger',
            label: '在线调试',
            children: (
              <Spin spinning={specLoading} tip="正在加载 API 文档...">
                <div style={{ minHeight: 400 }}>
                  {spec ? (
                    <SwaggerUI
                      spec={spec as any}
                      docExpansion="list"
                      defaultModelsExpandDepth={-1}
                      requestInterceptor={requestInterceptor}
                      showExtensions={false}
                      showCommonExtensions={false}
                    />
                  ) : (
                    !specLoading && (
                      <Empty
                        description="暂未获取到 API 文档"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                      />
                    )
                  )}
                </div>
              </Spin>
            ),
          },
        ]}
      />
    </PageContainer>
  );
};

export default ApiDoc;
