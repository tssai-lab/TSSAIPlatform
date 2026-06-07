import { CodeOutlined, EditOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useParams, useSearchParams } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import CodePreview from '@/components/CodePreview';
import { resolveModelVersionId } from '@/services/model';
import {
  deleteModelAsset,
  deleteModelVersion,
  fetchModelAssetDetail,
  fetchModelVersionCodePreview,
  getDownloadUrl,
  getModelVersion,
  updateModelAsset,
} from '@/services/platform';

const TYPE_OPTIONS = [
  { value: 'CV', label: 'CV' },
  { value: 'NLP', label: 'NLP' },
  { value: 'POINT_CLOUD', label: '点云' },
  { value: 'ROBOT', label: 'ROBOT（预留）' },
];

const typeColor: Record<string, string> = {
  CV: 'blue',
  NLP: 'green',
  POINT_CLOUD: 'purple',
  ROBOT: 'default',
};

const ModelDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [assetInfo, setAssetInfo] = useState<API.ModelAssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [codeLoading, setCodeLoading] = useState(false);
  const [versionCode, setVersionCode] = useState<API.ModelVersionDetail | null>(
    null,
  );
  const [codePreviewVisible, setCodePreviewVisible] = useState(false);

  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [assetModalLoading, setAssetModalLoading] = useState(false);
  const [assetForm] = Form.useForm();

  const loadAsset = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const assetId = id;
      if (/^model-ver-/i.test(id)) {
        const verRes = await getModelVersion(id, { skipErrorHandler: true });
        const aid = verRes?.data?.assetId;
        if (aid) {
          history.replace(
            `/model/detail/${encodeURIComponent(aid)}?versionId=${encodeURIComponent(id)}`,
          );
          return;
        }
      }

      const res = await fetchModelAssetDetail(assetId, {
        skipErrorHandler: true,
      });
      const detail = res?.data ?? null;
      setAssetInfo(detail);

      const queryVersionId = searchParams.get('versionId') ?? undefined;
      const defaultVersionId =
        (queryVersionId && queryVersionId !== assetId
          ? queryVersionId
          : undefined) ??
        detail?.defaultVersionId ??
        resolveModelVersionId(detail?.latestVersion, assetId) ??
        detail?.versions
          .map((v) => resolveModelVersionId(v, assetId))
          .find(Boolean);
      setSelectedVersionId(defaultVersionId);
    } catch (error: any) {
      message.error(
        error?.info?.message || error?.message || '加载模型详情失败',
      );
      setAssetInfo(null);
    } finally {
      setLoading(false);
    }
  }, [id, searchParams]);

  useEffect(() => {
    loadAsset();
  }, [loadAsset]);

  useEffect(() => {
    if (!selectedVersionId) {
      setVersionCode(null);
      return;
    }
    setCodeLoading(true);
    fetchModelVersionCodePreview(selectedVersionId, { skipErrorHandler: true })
      .then((res) => setVersionCode(res?.data ?? null))
      .catch(() => setVersionCode(null))
      .finally(() => setCodeLoading(false));
  }, [selectedVersionId]);

  const handleDeleteAsset = async () => {
    if (!id) return;
    try {
      await deleteModelAsset(id);
      message.success('模型资产已删除');
      history.push('/model/list');
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  const handleDownload = (storagePath?: string) => {
    if (!storagePath) {
      message.warning('当前版本没有可下载文件');
      return;
    }
    window.open(getDownloadUrl(storagePath), '_blank');
  };

  const openEditAsset = () => {
    if (!assetInfo) return;
    assetForm.setFieldsValue({
      name: assetInfo.name,
      type: assetInfo.type,
      remark: assetInfo.remark,
    });
    setAssetModalOpen(true);
  };

  const submitEditAsset = async () => {
    if (!id) return;
    try {
      const values = await assetForm.validateFields();
      setAssetModalLoading(true);
      await updateModelAsset(id, values, { skipErrorHandler: true });
      message.success('模型资产已更新');
      setAssetModalOpen(false);
      await loadAsset();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.info?.message || error?.message || '更新失败');
    } finally {
      setAssetModalLoading(false);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    try {
      await deleteModelVersion(versionId);
      message.success('版本已删除');
      if (selectedVersionId === versionId) {
        setSelectedVersionId(undefined);
      }
      await loadAsset();
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  const selectedVersion = assetInfo?.versions.find(
    (v) => v.id === selectedVersionId,
  );

  if (loading) {
    return (
      <PageContainer
        title="模型详情"
        onBack={() => history.push('/model/list')}
      >
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  if (!assetInfo) {
    return (
      <PageContainer
        title="模型详情"
        onBack={() => history.push('/model/list')}
      >
        <Empty description="未找到模型资产" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="模型详情"
      subTitle="模型资产与已上传的版本文件"
      onBack={() => history.push('/model/list')}
      extra={
        <Space>
          <Button
            type="primary"
            disabled={!selectedVersionId}
            onClick={() =>
              history.push(
                `/task/create?modelVersionId=${encodeURIComponent(selectedVersionId as string)}`,
              )
            }
          >
            使用选中版本训练
          </Button>
          <Button
            onClick={() =>
              history.push(
                `/model/upload?assetId=${encodeURIComponent(assetInfo.id)}&modelName=${encodeURIComponent(assetInfo.name)}&type=${encodeURIComponent(assetInfo.type)}`,
              )
            }
          >
            上传新版本
          </Button>
          <Button icon={<EditOutlined />} onClick={openEditAsset}>
            编辑资产
          </Button>
          <Popconfirm
            title="确认删除该模型资产？将删除其下全部版本。"
            onConfirm={handleDeleteAsset}
          >
            <Button danger>删除资产</Button>
          </Popconfirm>
          <Button onClick={() => history.push('/model/list')}>返回列表</Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="模型版本 vs 训练实验版本"
        description={
          <>
            <strong>模型版本</strong>
            ：上传
            zip（代码或预训练权重）时填写版本号自动创建，作为发起训练时的输入包。
            <br />
            <strong>训练实验版本</strong>
            ：在某次训练结果上继续调参、再训练，请在「训练任务详情」使用
            <Typography.Link onClick={() => history.push('/task/list')}>
              基于此版本继续训练
            </Typography.Link>
            ，系统会按 experimentId
            记录每次迭代的超参与数据集关联（合同约定的版本管理）。
            <br />
            如需新增模型文件版本，请使用右上角「上传新版本」并填写新的版本号，无需手动创建空记录。
          </>
        }
      />

      <Card title="资产信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="模型名称">
            <strong>{assetInfo.name}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="类型">
            <Tag color={typeColor[assetInfo.type] ?? 'default'}>
              {assetInfo.type}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="资产 ID">
            <Typography.Text copyable code style={{ fontSize: 12 }}>
              {assetInfo.id}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="版本数量">
            {assetInfo.versions.length}
          </Descriptions.Item>
          <Descriptions.Item label="最近上传">
            {assetInfo.uploadTime || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {assetInfo.updatedAt || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {assetInfo.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="已上传版本" style={{ marginBottom: 16 }}>
        <Table
          dataSource={assetInfo.versions}
          rowKey="id"
          pagination={false}
          scroll={{ x: 960 }}
          locale={{
            emptyText: '暂无版本，请通过「上传新版本」或模型上传页首次上传',
          }}
          onRow={(record) => ({
            onClick: () => setSelectedVersionId(record.id),
            style: {
              cursor: 'pointer',
              background:
                record.id === selectedVersionId ? '#e6f4ff' : undefined,
            },
          })}
          columns={[
            {
              title: '版本号',
              dataIndex: 'version',
              key: 'version',
              width: 100,
            },
            {
              title: '版本 ID',
              dataIndex: 'id',
              key: 'id',
              width: 160,
              ellipsis: true,
              render: (v: string) => (
                <Tooltip title={v}>
                  <Typography.Text code style={{ fontSize: 11 }}>
                    {v}
                  </Typography.Text>
                </Tooltip>
              ),
            },
            {
              title: '文件名',
              dataIndex: 'fileName',
              key: 'fileName',
              width: 140,
              ellipsis: true,
            },
            { title: '大小', dataIndex: 'size', key: 'size', width: 100 },
            {
              title: '上传时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
              width: 180,
            },
            {
              title: '操作',
              key: 'action',
              width: 200,
              fixed: 'right',
              align: 'left',
              render: (_, record: API.ModelVersionDetail) => (
                <Space
                  size={0}
                  split={<span style={{ color: '#f0f0f0' }}>|</span>}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    type="link"
                    style={{ paddingLeft: 0 }}
                    onClick={() => setSelectedVersionId(record.id)}
                  >
                    选中
                  </Button>
                  <Button
                    type="link"
                    onClick={() => handleDownload(record.storagePath)}
                  >
                    下载
                  </Button>
                  <Popconfirm
                    title="确认删除该版本？"
                    onConfirm={() => handleDeleteVersion(record.id)}
                  >
                    <Button type="link" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
        <Typography.Text
          type="secondary"
          style={{ display: 'block', marginTop: 8 }}
        >
          每个版本对应一次上传的 zip 文件；发起训练时在创建任务页选择
          modelVersionId（版本 ID）。
        </Typography.Text>
      </Card>

      <Card
        title={
          <Space>
            <CodeOutlined />
            代码预览
            {selectedVersion ? ` · ${selectedVersion.version}` : ''}
          </Space>
        }
      >
        {!selectedVersionId && (
          <Empty
            description="请从版本列表选择一个版本"
            style={{ padding: 48 }}
          />
        )}
        {selectedVersionId && codeLoading && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin tip="加载代码…" />
          </div>
        )}
        {selectedVersionId && !codeLoading && versionCode?.codeContent && (
          <>
            <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="预览文件">
                {versionCode.codeFileName || versionCode.codeFilePath || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="存储路径">
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {versionCode.storagePath || '-'}
                </span>
              </Descriptions.Item>
            </Descriptions>
            <pre
              style={{
                background: '#f5f5f5',
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                padding: 16,
                maxHeight: 400,
                overflow: 'auto',
                margin: 0,
                fontFamily: 'Courier New, monospace',
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {versionCode.codeContent}
            </pre>
            <Space style={{ marginTop: 12 }}>
              <Button
                type="primary"
                size="small"
                icon={<CodeOutlined />}
                onClick={() => setCodePreviewVisible(true)}
              >
                弹窗查看
              </Button>
            </Space>
          </>
        )}
        {selectedVersionId && !codeLoading && !versionCode?.codeContent && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              selectedVersion?.storagePath
                ? '当前版本包中没有可预览的代码文件'
                : '该版本尚未绑定模型文件，请先上传'
            }
          />
        )}
      </Card>

      {codePreviewVisible && versionCode?.codeContent && (
        <CodePreview
          visible={codePreviewVisible}
          codeText={versionCode.codeContent}
          fileName={
            versionCode.codeFileName || versionCode.codeFilePath || 'model-code'
          }
          onClose={() => setCodePreviewVisible(false)}
        />
      )}

      <Modal
        title="编辑模型资产"
        open={assetModalOpen}
        onCancel={() => setAssetModalOpen(false)}
        onOk={submitEditAsset}
        confirmLoading={assetModalLoading}
        destroyOnClose
      >
        <Form form={assetForm} layout="vertical">
          <Form.Item
            name="name"
            label="模型名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default ModelDetail;
