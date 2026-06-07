import { EditOutlined, PlusOutlined } from '@ant-design/icons';
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
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PointCloudPreviewPanel, {
  type PointCloudPreviewPanelRef,
} from '@/pages/dataset/components/point-cloud/PointCloudPreviewPanel';
import { resolveDatasetVersionId } from '@/services/dataset';
import {
  createDatasetVersion,
  deleteDataset,
  deleteDatasetVersion,
  fetchDatasetDetail,
  getDownloadUrl,
  updateDatasetVersion,
} from '@/services/platform';
import {
  DATASET_VERSION_DESC_PLACEHOLDER,
  DATASET_VERSION_FORMAT_HINT,
  datasetVersionDescFormRules,
  datasetVersionFormRules,
  suggestNextDatasetVersion,
} from '@/utils/datasetVersion';
import DatasetPreviewPanel from '../components/DatasetPreviewPanel';

const DATASET_TYPE_LABEL: Record<string, string> = {
  CV: 'CV',
  NLP: 'NLP',
  POINT_CLOUD: '点云',
};

const DATASET_TYPE_COLOR: Record<string, string> = {
  CV: 'blue',
  NLP: 'green',
  POINT_CLOUD: 'purple',
};

const DatasetDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const previewSectionRef = useRef<HTMLDivElement>(null);
  const [datasetInfo, setDatasetInfo] = useState<API.DatasetDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [previewVersionId, setPreviewVersionId] = useState<string>();

  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [versionModalMode, setVersionModalMode] = useState<'create' | 'edit'>(
    'create',
  );
  const [versionModalLoading, setVersionModalLoading] = useState(false);
  const [editingVersion, setEditingVersion] =
    useState<API.DatasetVersionDetail | null>(null);
  const [versionForm] = Form.useForm();

  const existingVersionNames = useMemo(
    () => datasetInfo?.versions.map((v) => v.version).filter(Boolean) ?? [],
    [datasetInfo],
  );

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetchDatasetDetail(id, { skipErrorHandler: true });
      const detail =
        (res?.data as
          | (API.DatasetDetail & { defaultVersionId?: string })
          | undefined) ?? null;
      setDatasetInfo(detail);
      const assetId = detail?.id;
      const queryVersionId = searchParams.get('versionId') ?? undefined;
      const defaultVersionId =
        (queryVersionId && queryVersionId !== assetId
          ? queryVersionId
          : undefined) ??
        detail?.defaultVersionId ??
        resolveDatasetVersionId(detail?.latestVersion, assetId) ??
        detail?.versions
          .map((v) => resolveDatasetVersionId(v, assetId))
          .find(Boolean);
      setPreviewVersionId(defaultVersionId);
    } catch (error: any) {
      message.error(
        error?.info?.message || error?.message || '加载数据集详情失败',
      );
      setDatasetInfo(null);
      setPreviewVersionId(undefined);
    } finally {
      setLoading(false);
    }
  }, [id, searchParams]);

  const previewPanelRef = useRef<PointCloudPreviewPanelRef>(null);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleDelete = async () => {
    if (!id) {
      return;
    }
    try {
      await deleteDataset(id);
      message.success('删除成功');
      history.push('/dataset/list');
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

  const handleUploadNewVersion = () => {
    if (!datasetInfo || !id) return;
    const params = new URLSearchParams({
      assetId: id,
      datasetName: datasetInfo.name,
      type: datasetInfo.type,
    });
    history.push(`/dataset/upload?${params.toString()}`);
  };

  const openCreateVersion = () => {
    setVersionModalMode('create');
    setEditingVersion(null);
    versionForm.setFieldsValue({
      version: suggestNextDatasetVersion(existingVersionNames),
      remark: '',
    });
    setVersionModalOpen(true);
  };

  const openEditVersion = (record: API.DatasetVersionDetail) => {
    setVersionModalMode('edit');
    setEditingVersion(record);
    versionForm.setFieldsValue({
      remark: record.remark ?? '',
    });
    setVersionModalOpen(true);
  };

  const submitVersionModal = async () => {
    if (!id) return;
    try {
      const values =
        versionModalMode === 'create'
          ? await versionForm.validateFields()
          : await versionForm.validateFields(['remark']);
      setVersionModalLoading(true);
      const remark = values.remark?.trim();
      if (versionModalMode === 'create') {
        const version = values.version.trim();
        await createDatasetVersion(
          { assetId: id, version, remark },
          { skipErrorHandler: true },
        );
        message.success('版本记录已创建，请通过「上传新版本」绑定数据文件');
      } else if (editingVersion) {
        await updateDatasetVersion(
          editingVersion.id,
          { version: editingVersion.version, remark },
          { skipErrorHandler: true },
        );
        message.success('版本描述已更新');
      }
      setVersionModalOpen(false);
      await loadDetail();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.info?.message || error?.message || '操作失败');
    } finally {
      setVersionModalLoading(false);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    try {
      await deleteDatasetVersion(versionId);
      message.success('版本已删除');
      if (previewVersionId === versionId) {
        setPreviewVersionId(undefined);
      }
      await loadDetail();
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  const handleSelectPreview = async (
    record: API.DatasetVersionDetail,
    scrollToPreview = true,
  ) => {
    const versionId =
      resolveDatasetVersionId(record, datasetInfo?.id) ?? record.id;
    if (!versionId || versionId === datasetInfo?.id) {
      message.warning('无法识别数据集版本 ID，请确认后端返回的版本 id 字段');
      return;
    }
    setPreviewVersionId(versionId);

    if (!scrollToPreview) return;

    if (datasetInfo?.type === 'POINT_CLOUD') {
      document
        .getElementById('point-cloud-preview')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await previewPanelRef.current?.loadVersion(record);
      return;
    }

    if (datasetInfo?.type === 'CV' || datasetInfo?.type === 'NLP') {
      requestAnimationFrame(() => {
        previewSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  };

  const previewVersion = datasetInfo?.versions.find(
    (v) => v.id === previewVersionId,
  );
  const isPointCloud = datasetInfo?.type === 'POINT_CLOUD';
  const supportsInlinePreview =
    datasetInfo?.type === 'CV' || datasetInfo?.type === 'NLP';

  const versionFormRules = useMemo(
    () => datasetVersionFormRules(existingVersionNames),
    [existingVersionNames],
  );

  if (loading) {
    return (
      <PageContainer
        title="数据集详情"
        onBack={() => history.push('/dataset/list')}
      >
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  if (!datasetInfo) {
    return (
      <PageContainer
        title="数据集详情"
        onBack={() => history.push('/dataset/list')}
      >
        <Empty description="未找到数据集详情" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="数据集详情"
      subTitle="数据集资产与版本管理；版本号采用 vX.Y.Z，版本描述记录更新原因与内容"
      onBack={() => history.push('/dataset/list')}
      extra={
        <Space>
          <Button type="primary" onClick={handleUploadNewVersion}>
            上传新版本
          </Button>
          <Button
            onClick={() =>
              handleDownload(datasetInfo.latestVersion?.storagePath)
            }
          >
            下载最新版本
          </Button>
          <Popconfirm
            title="确认删除该数据集？删除后无法恢复。"
            onConfirm={handleDelete}
          >
            <Button danger>删除数据集</Button>
          </Popconfirm>
          <Button onClick={() => history.push('/dataset/list')}>
            返回列表
          </Button>
        </Space>
      }
    >
      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="数据集名称">
            <strong>{datasetInfo.name}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="类型">
            <Tag color={DATASET_TYPE_COLOR[datasetInfo.type] ?? 'green'}>
              {DATASET_TYPE_LABEL[datasetInfo.type] ?? datasetInfo.type}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="最近上传时间">
            {datasetInfo.uploadTime || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="版本数量">
            {datasetInfo.versions.length}
          </Descriptions.Item>
          <Descriptions.Item label="资产备注" span={2}>
            {datasetInfo.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="版本列表"
        style={{ marginBottom: 16 }}
        extra={
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={openCreateVersion}
          >
            新建版本记录
          </Button>
        }
      >
        <Table
          dataSource={datasetInfo.versions}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1040 }}
          locale={{ emptyText: '暂无版本记录' }}
          onRow={(record) => ({
            onClick: () => handleSelectPreview(record),
            style: {
              cursor: 'pointer',
              background:
                (resolveDatasetVersionId(record, datasetInfo.id) ??
                  record.id) === previewVersionId
                  ? '#e6f4ff'
                  : undefined,
            },
          })}
          rowClassName={(record) =>
            record.id === previewVersionId
              ? 'dataset-preview-version-row-active'
              : ''
          }
          columns={[
            {
              title: '版本号',
              dataIndex: 'version',
              key: 'version',
              width: 100,
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
              title: '版本描述',
              dataIndex: 'remark',
              key: 'remark',
              width: 160,
              ellipsis: true,
              render: (text: string) =>
                text ? (
                  <Tooltip title={text}>
                    <span>{text}</span>
                  </Tooltip>
                ) : (
                  <Typography.Text type="secondary">未填写</Typography.Text>
                ),
            },
            {
              title: '操作',
              key: 'action',
              width: 280,
              fixed: 'right',
              align: 'left',
              render: (_, record: API.DatasetVersionDetail) => (
                <Space
                  size={0}
                  wrap
                  split={<span style={{ color: '#f0f0f0' }}>|</span>}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    type="link"
                    style={{ paddingLeft: 0 }}
                    onClick={() => handleSelectPreview(record)}
                  >
                    选中预览
                  </Button>
                  <Button
                    type="link"
                    icon={<EditOutlined />}
                    onClick={() => openEditVersion(record)}
                  >
                    编辑描述
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
          版本号须为 vX.Y.Z
          格式；版本描述记录更新原因与内容。新建版本记录后请「上传新版本」绑定文件；点击行可切换下方预览。
        </Typography.Text>
      </Card>

      {!isPointCloud && (
        <div ref={previewSectionRef}>
          <Card
            title="内容预览"
            extra={
              previewVersion ? (
                <Typography.Text type="secondary">
                  当前版本：{previewVersion.version}
                  {previewVersion.fileName
                    ? ` · ${previewVersion.fileName}`
                    : ''}
                </Typography.Text>
              ) : null
            }
          >
            {supportsInlinePreview ? (
              <DatasetPreviewPanel
                key={previewVersionId}
                versionId={previewVersionId}
                compact
              />
            ) : (
              <Empty description="当前类型不支持在线预览" />
            )}
          </Card>
        </div>
      )}

      {isPointCloud && (
        <>
          <style>{`
            .dataset-preview-version-row-active > td {
              background-color: #e6f4ff !important;
            }
            .dataset-preview-version-row-active:hover > td {
              background-color: #bae0ff !important;
            }
          `}</style>
          <PointCloudPreviewPanel
            ref={previewPanelRef}
            onSelectionChange={setPreviewVersionId}
          />
        </>
      )}

      <Modal
        title={versionModalMode === 'create' ? '新建版本记录' : '编辑版本描述'}
        open={versionModalOpen}
        onCancel={() => setVersionModalOpen(false)}
        onOk={submitVersionModal}
        confirmLoading={versionModalLoading}
        destroyOnClose
        width={560}
      >
        <Form form={versionForm} layout="vertical">
          {versionModalMode === 'create' ? (
            <Form.Item
              name="version"
              label="版本号"
              rules={versionFormRules}
              extra={DATASET_VERSION_FORMAT_HINT}
            >
              <Input placeholder="例如 v1.0.0" />
            </Form.Item>
          ) : (
            <Form.Item label="版本号">
              <Typography.Text strong>
                {editingVersion?.version || '-'}
              </Typography.Text>
              <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                版本号创建后不可修改；如需新版本请使用「上传新版本」。
              </div>
            </Form.Item>
          )}
          <Form.Item
            name="remark"
            label="版本描述"
            rules={datasetVersionDescFormRules()}
            extra="说明本版本的更新原因与内容"
          >
            <Input.TextArea
              rows={4}
              placeholder={DATASET_VERSION_DESC_PLACEHOLDER}
              showCount
              maxLength={2000}
            />
          </Form.Item>
          {versionModalMode === 'create' && (
            <Alert
              type="info"
              showIcon
              message="创建版本记录后，请通过「上传新版本」上传数据文件完成绑定。"
            />
          )}
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default DatasetDetail;
