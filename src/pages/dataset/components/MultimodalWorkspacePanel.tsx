import {
  CloseCircleOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Progress,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import React, { useCallback, useEffect, useState } from 'react';
import MultimodalImportBanner from '@/pages/dataset/components/MultimodalImportBanner';
import {
  deleteWorkspaceSample,
  fetchWorkspaceSampleDetail,
  fetchWorkspaceSamples,
  MULTIMODAL_DATA_TYPE_LABEL,
  type MultimodalSampleDetail,
  type MultimodalSampleGrouping,
  type MultimodalSampleSummary,
  publishDraftVersion,
  publishV2EditSession,
  restoreWorkspaceSample,
  uploadDraftAppendPackage,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import type { WorkspaceEditableDatasetType } from '@/utils/datasetWorkspace';

type MultimodalWorkspacePanelProps = {
  draftVersionId: string;
  datasetType?: WorkspaceEditableDatasetType;
  draftVersionLabel?: string;
  parentVersionLabel?: string;
  onPublished?: () => void;
  onRefresh?: () => void;
  onCancelEdit?: () => void | Promise<void>;
};

const MultimodalWorkspacePanel: React.FC<MultimodalWorkspacePanelProps> = ({
  draftVersionId,
  datasetType = 'MULTIMODAL',
  draftVersionLabel,
  parentVersionLabel,
  onPublished,
  onRefresh,
  onCancelEdit,
}) => {
  const isMultimodalDataset = datasetType === 'MULTIMODAL';
  const itemLabel = isMultimodalDataset ? '样本' : '文件';
  const [samples, setSamples] = useState<MultimodalSampleSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<MultimodalSampleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [appendOpen, setAppendOpen] = useState(false);
  const [appendForm] = Form.useForm();
  const [appendUploading, setAppendUploading] = useState(false);
  const [appendPercent, setAppendPercent] = useState(0);
  const [appendImportJobId, setAppendImportJobId] = useState<string | null>(
    null,
  );

  const [publishing, setPublishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const sampleGrouping = Form.useWatch('sampleGrouping', appendForm) as
    | MultimodalSampleGrouping
    | undefined;

  const loadSamples = useCallback(
    async (p = page, ps = pageSize) => {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetchWorkspaceSamples(
          draftVersionId,
          { page: p, pageSize: ps, includeDeleted },
          { skipErrorHandler: true },
        );
        const data = res?.data;
        setSamples(data?.data ?? []);
        setTotal(data?.total ?? 0);
        setPage(data?.page ?? p);
        setPageSize(data?.pageSize ?? ps);
      } catch (e: unknown) {
        setListError(getApiErrorMessage(e));
        setSamples([]);
        setTotal(0);
      } finally {
        setListLoading(false);
      }
    },
    [draftVersionId, includeDeleted, page, pageSize],
  );

  useEffect(() => {
    void loadSamples(1, pageSize);
  }, [draftVersionId, includeDeleted]);

  const openDetail = async (sampleId: string) => {
    setDrawerOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetchWorkspaceSampleDetail(sampleId, {
        skipErrorHandler: true,
      });
      setDetail(res?.data ?? null);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e));
      setDrawerOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (sampleId: string) => {
    try {
      await deleteWorkspaceSample(sampleId, { skipErrorHandler: true });
      message.success('样本已标记删除');
      await loadSamples(page, pageSize);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e));
    }
  };

  const handleRestore = async (sampleId: string) => {
    try {
      await restoreWorkspaceSample(sampleId, { skipErrorHandler: true });
      message.success('样本已恢复');
      await loadSamples(page, pageSize);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e));
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      try {
        await publishV2EditSession(draftVersionId, { skipErrorHandler: true });
      } catch {
        await publishDraftVersion(draftVersionId, { skipErrorHandler: true });
      }
      message.success('已发布为新版本，当前正式版本已更新');
      onPublished?.();
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e));
    } finally {
      setPublishing(false);
    }
  };

  const handleCancelEdit = async () => {
    if (!onCancelEdit) return;
    setCancelling(true);
    try {
      await onCancelEdit();
    } finally {
      setCancelling(false);
    }
  };

  const handleAppendSubmit = async () => {
    const values = await appendForm.validateFields();
    const fileList = (values.file ?? []) as UploadFile[];
    const file = fileList.map((f) => f.originFileObj).filter(Boolean)[0] as
      | File
      | undefined;
    if (!file) {
      message.error('请选择 zip 文件');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      message.error('追加包须为 .zip 格式');
      return;
    }

    setAppendUploading(true);
    setAppendPercent(0);
    setAppendImportJobId(null);
    try {
      const res = await uploadDraftAppendPackage(
        draftVersionId,
        file,
        {
          ...(isMultimodalDataset
            ? {
                sampleGrouping:
                  values.sampleGrouping as MultimodalSampleGrouping,
                manifestPath: values.manifestPath?.trim(),
              }
            : {}),
          onProgress: setAppendPercent,
        },
        { skipErrorHandler: true },
      );
      const jobId = res?.data?.importJobId ?? null;
      setAppendImportJobId(jobId);
      message.success(
        jobId
          ? `追加包上传完成，后台正在导入新${itemLabel}`
          : `追加包上传完成，新${itemLabel}已加入草稿`,
      );
      setAppendOpen(false);
      appendForm.resetFields();
      onRefresh?.();
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e));
    } finally {
      setAppendUploading(false);
      setAppendPercent(0);
    }
  };

  const columns: ColumnsType<MultimodalSampleSummary> = [
    { title: '序号', dataIndex: 'sampleIndex', width: 72 },
    {
      title: isMultimodalDataset ? '外部 ID' : '文件标识',
      dataIndex: 'externalId',
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    ...(isMultimodalDataset
      ? [
          {
            title: '标签',
            dataIndex: 'tags',
            width: 160,
            ellipsis: true,
            render: (tags: Record<string, unknown> | undefined) => {
              const entries = Object.entries(tags ?? {}).slice(0, 2);
              if (!entries.length) return '-';
              return entries.map(([k, val]) => (
                <Tag key={k}>
                  {k}: {String(val)}
                </Tag>
              ));
            },
          } as ColumnsType<MultimodalSampleSummary>[number],
        ]
      : []),
    {
      title: '状态',
      key: 'deleted',
      width: 88,
      render: (_, record) =>
        record.deleted ? (
          <Tag color="default">已删除</Tag>
        ) : (
          <Tag color="success">正常</Tag>
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space size={0} onClick={(e) => e.stopPropagation()}>
          <Button type="link" onClick={() => openDetail(record.sampleId)}>
            详情
          </Button>
          {record.deleted ? (
            <Button
              type="link"
              icon={<RollbackOutlined />}
              onClick={() => handleRestore(record.sampleId)}
            >
              恢复
            </Button>
          ) : (
            <Popconfirm
              title="确认从本版本草稿中删除该样本？发布前可恢复。"
              onConfirm={() => handleDelete(record.sampleId)}
            >
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const handleTableChange = (pagination: TablePaginationConfig) => {
    void loadSamples(pagination.current ?? 1, pagination.pageSize ?? pageSize);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="版本编辑草稿"
        description={
          <>
            {draftVersionLabel ? (
              <>
                新版本 <strong>{draftVersionLabel}</strong>（草稿）基于
              </>
            ) : (
              <>基于</>
            )}
            {parentVersionLabel ? `「${parentVersionLabel}」` : '当前正式版本'}
            复制，<strong>尚未生效</strong>。请删除/恢复{itemLabel}或追加
            zip；完成后「发布为新版本」保存，或「取消增删」放弃并回到编辑前。
            {!isMultimodalDataset && (
              <>
                <br />
                草稿阶段不支持在线预览，发布为正式版后可预览。
              </>
            )}
          </>
        }
      />

      {appendImportJobId && (
        <MultimodalImportBanner
          importJobId={appendImportJobId}
          onImportFinished={() => {
            setAppendImportJobId(null);
            void loadSamples(page, pageSize);
            onRefresh?.();
          }}
        />
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          onClick={() => setAppendOpen(true)}
        >
          追加{itemLabel}
        </Button>
        <Popconfirm
          title="确认发布？发布后将变为新的正式版本并对外生效。"
          onConfirm={handlePublish}
        >
          <Button type="primary" loading={publishing}>
            发布为新版本
          </Button>
        </Popconfirm>
        {onCancelEdit && (
          <Popconfirm
            title="放弃本次增删编辑？草稿版本将被删除，已删样本不会保存。"
            onConfirm={() => void handleCancelEdit()}
          >
            <Button danger icon={<CloseCircleOutlined />} loading={cancelling}>
              取消增删
            </Button>
          </Popconfirm>
        )}
        <Button
          icon={<ReloadOutlined />}
          onClick={() => loadSamples(page, pageSize)}
        >
          刷新
        </Button>
        <Space>
          <Typography.Text>显示已删除</Typography.Text>
          <Switch checked={includeDeleted} onChange={setIncludeDeleted} />
        </Space>
      </Space>

      {listError && (
        <Typography.Paragraph type="danger">{listError}</Typography.Paragraph>
      )}

      <Table
        size="small"
        rowKey="sampleId"
        loading={listLoading}
        columns={columns}
        dataSource={samples}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (t) => `共 ${t} 个${itemLabel}`,
        }}
        onChange={handleTableChange}
        locale={{
          emptyText: listError ? '加载失败' : `编辑草稿中暂无${itemLabel}`,
        }}
        scroll={{ y: 360 }}
      />

      <Drawer
        title={
          detail
            ? `${itemLabel}：${detail.externalId || detail.sampleId}`
            : `${itemLabel}详情`
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
        destroyOnClose
      >
        {detailLoading && <Typography.Text>加载中…</Typography.Text>}
        {detail && !detailLoading && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="样本 ID">
                {detail.sampleId}
              </Descriptions.Item>
              <Descriptions.Item label="外部 ID">
                {detail.externalId || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="序号">
                {detail.sampleIndex}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {detail.deleted ? '已删除' : '正常'}
              </Descriptions.Item>
            </Descriptions>
            <div>
              <Typography.Title level={5}>数据项</Typography.Title>
              {detail.data?.length ? (
                detail.data.map((item) => (
                  <div
                    key={item.sampleDataId}
                    style={{
                      border: '1px solid #f0f0f0',
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 8,
                    }}
                  >
                    <Space wrap>
                      <Tag color="blue">
                        {MULTIMODAL_DATA_TYPE_LABEL[item.dataType] ??
                          item.dataType}
                      </Tag>
                      <Typography.Text type="secondary">
                        {item.fileName}
                        {item.sizeBytes != null ? ` · ${item.sizeBytes} B` : ''}
                      </Typography.Text>
                    </Space>
                  </div>
                ))
              ) : (
                <Typography.Text type="secondary">无数据项</Typography.Text>
              )}
            </div>
            {!!detail.annotations?.length && (
              <div>
                <Typography.Title level={5}>标注</Typography.Title>
                {detail.annotations.map((a) => (
                  <div key={a.annotationId} style={{ marginBottom: 8 }}>
                    <Tag>{a.annotationType || a.format || '标注'}</Tag>
                    <Typography.Text type="secondary">
                      {' '}
                      {a.fileName}
                    </Typography.Text>
                  </div>
                ))}
              </div>
            )}
            {!detail.deleted && (
              <Popconfirm
                title="确认从本版本草稿中删除该样本？"
                onConfirm={async () => {
                  await handleDelete(detail.sampleId);
                  setDrawerOpen(false);
                }}
              >
                <Button danger>删除此样本</Button>
              </Popconfirm>
            )}
            {detail.deleted && (
              <Button
                icon={<RollbackOutlined />}
                onClick={async () => {
                  await handleRestore(detail.sampleId);
                  setDrawerOpen(false);
                }}
              >
                恢复此样本
              </Button>
            )}
          </Space>
        )}
      </Drawer>

      <Modal
        title={`追加${itemLabel}（上传 zip）`}
        open={appendOpen}
        onCancel={() => !appendUploading && setAppendOpen(false)}
        onOk={handleAppendSubmit}
        confirmLoading={appendUploading}
        destroyOnClose
        width={560}
      >
        <Form
          form={appendForm}
          layout="vertical"
          initialValues={
            isMultimodalDataset
              ? { sampleGrouping: 'AUTO_DIRECTORY' }
              : undefined
          }
        >
          {isMultimodalDataset && (
            <>
              <Form.Item
                name="sampleGrouping"
                label="样本分组"
                rules={[{ required: true }]}
              >
                <Select>
                  <Select.Option value="AUTO_DIRECTORY">
                    按目录自动识别（推荐）
                  </Select.Option>
                  <Select.Option value="MANIFEST">
                    Manifest 索引文件
                  </Select.Option>
                </Select>
              </Form.Item>
              {sampleGrouping === 'MANIFEST' && (
                <Form.Item name="manifestPath" label="Manifest 路径">
                  <Input placeholder="默认 manifest.json" />
                </Form.Item>
              )}
            </>
          )}
          <Form.Item
            name="file"
            label="ZIP 文件"
            valuePropName="fileList"
            getValueFromEvent={(e) => e?.fileList ?? []}
            rules={[{ required: true, message: '请选择 zip 文件' }]}
          >
            <Upload accept=".zip" maxCount={1} beforeUpload={() => false}>
              <Button icon={<CloudUploadOutlined />}>选择 zip</Button>
            </Upload>
          </Form.Item>
          <Typography.Text type="secondary">
            {isMultimodalDataset
              ? '仅新增样本，不会修改已有样本；若 zip 内样本 ID 与草稿中已有样本冲突，导入会失败。'
              : '仅追加 zip 内新文件，不会修改已有文件；追加包须符合当前数据集类型的文件格式要求。'}
          </Typography.Text>
        </Form>
        {appendUploading && (
          <Progress percent={appendPercent} style={{ marginTop: 16 }} />
        )}
      </Modal>
    </>
  );
};

export default MultimodalWorkspacePanel;
