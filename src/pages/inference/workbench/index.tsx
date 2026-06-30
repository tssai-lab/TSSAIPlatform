import {
  CloudUploadOutlined,
  DownloadOutlined,
  FileSearchOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProCard, ProTable } from '@ant-design/pro-components';
import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Progress,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createInferenceTask,
  downloadObject,
  fetchDatasetList,
  fetchModelList,
  formatInferenceBytes,
  type InferenceInputMode,
  type InferenceScriptVersion,
  type InferenceTask,
  listInferenceScripts,
  listInferenceTasks,
  objectNameFromMinioPath,
  stopInferenceTask,
  uploadInferenceScript,
  uploadObject,
} from '@/services/platform';

const { TextArea } = Input;

const STATUS_MAP: Record<string, { color: string; text: string }> = {
  pending: { color: 'default', text: '待提交' },
  queued: { color: 'warning', text: '排队中' },
  running: { color: 'processing', text: '运行中' },
  success: { color: 'success', text: '成功' },
  failed: { color: 'error', text: '失败' },
  stopped: { color: 'default', text: '已停止' },
};

function statusTag(status?: string) {
  const item = STATUS_MAP[status || ''] || {
    color: 'default',
    text: status || '-',
  };
  return <Tag color={item.color}>{item.text}</Tag>;
}

function parseJson(text?: string) {
  const raw = text?.trim();
  if (!raw) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('JSON 参数必须是对象');
  }
  return value as Record<string, unknown>;
}

function minioPathToResultObject(outputPath?: string | null) {
  const objectName = objectNameFromMinioPath(outputPath);
  if (!objectName) return '';
  return `${objectName.replace(/\/?$/, '/')}result.json`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function shortId(value?: string) {
  if (!value) return '';
  return value.length > 14 ? `...${value.slice(-8)}` : value;
}

const InferenceWorkbench: React.FC = () => {
  const [taskForm] = Form.useForm();
  const [scriptForm] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const [modelOptions, setModelOptions] = useState<any[]>([]);
  const [datasetOptions, setDatasetOptions] = useState<any[]>([]);
  const [scriptOptions, setScriptOptions] = useState<InferenceScriptVersion[]>(
    [],
  );
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scriptUploading, setScriptUploading] = useState(false);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [scriptFileList, setScriptFileList] = useState<UploadFile[]>([]);
  const [inputFileList, setInputFileList] = useState<UploadFile[]>([]);
  const [inputMode, setInputMode] =
    useState<InferenceInputMode>('SINGLE_OBJECT');
  const [selectedTask, setSelectedTask] = useState<InferenceTask>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const modelSelectOptions = useMemo(
    () =>
      modelOptions
        .filter((item) => item.id)
        .map((item) => ({
          label: [
            item.name || '未命名模型',
            item.version || item.id,
            item.fileName,
            shortId(item.id),
          ]
            .filter(Boolean)
            .join(' / '),
          value: item.id,
        })),
    [modelOptions],
  );

  const datasetSelectOptions = useMemo(
    () =>
      datasetOptions
        .filter(
          (item) =>
            item.versionId &&
            (!item.versionStatus || item.versionStatus === 'READY'),
        )
        .map((item) => ({
          label: `${item.name || '未命名数据集'} / ${item.version || item.versionId}`,
          value: item.versionId,
        })),
    [datasetOptions],
  );

  const scriptSelectOptions = useMemo(
    () =>
      scriptOptions
        .filter((item) => item.status !== 'DELETED')
        .map((item) => ({
          label: `${item.scriptName} / ${item.version} / ${item.entryFile}`,
          value: item.id,
        })),
    [scriptOptions],
  );

  const reloadAssets = async () => {
    setLoadingAssets(true);
    try {
      const [modelRes, datasetRes, scriptRes] = await Promise.all([
        fetchModelList({ pageSize: 200 }),
        fetchDatasetList({ pageSize: 200 }),
        listInferenceScripts({ skipErrorHandler: true }),
      ]);
      setModelOptions((modelRes as any)?.data ?? []);
      setDatasetOptions((datasetRes as any)?.data ?? []);
      setScriptOptions(scriptRes?.data ?? []);
    } catch (error: any) {
      message.error(error?.message || '资源加载失败');
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    reloadAssets();
  }, []);

  const handleUploadScript = async () => {
    const values = await scriptForm.validateFields();
    const file = scriptFileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.warning('请选择推理脚本 ZIP');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      message.warning('脚本文件必须是 ZIP');
      return;
    }
    if (values.paramsSchemaJson?.trim()) {
      parseJson(values.paramsSchemaJson);
    }

    setScriptUploading(true);
    try {
      const res = await uploadInferenceScript(
        {
          file,
          scriptName: values.scriptName.trim(),
          version: values.version?.trim() || 'v1',
          runtime: values.runtime || 'PYTHON3',
          entryFile: values.entryFile.trim(),
          paramsSchemaJson: values.paramsSchemaJson,
          remark: values.remark,
        },
        { skipErrorHandler: true },
      );
      message.success('推理脚本已上传');
      setScriptModalOpen(false);
      scriptForm.resetFields();
      setScriptFileList([]);
      await reloadAssets();
      if (res?.data?.scriptVersionId) {
        taskForm.setFieldValue('scriptVersionId', res.data.scriptVersionId);
      }
    } catch (error: any) {
      message.error(error?.message || '脚本上传失败');
    } finally {
      setScriptUploading(false);
    }
  };

  const handleCreateTask = async () => {
    const values = await taskForm.validateFields();
    setCreating(true);
    try {
      const params = parseJson(values.paramsJson);
      let inputObjectName = values.inputObjectName?.trim();
      if (values.inputMode === 'SINGLE_OBJECT' && !inputObjectName) {
        const file = inputFileList[0]?.originFileObj as File | undefined;
        if (!file) {
          throw new Error('请选择单文件输入或填写已有对象路径');
        }
        const objectName = `inference-inputs/${Date.now()}-${file.name}`;
        const uploadRes = await uploadObject(file, objectName, {
          skipErrorHandler: true,
        });
        inputObjectName = uploadRes?.data?.objectName;
      }

      const res = await createInferenceTask(
        {
          name: values.name.trim(),
          modelVersionId: values.modelVersionId,
          scriptVersionId: values.scriptVersionId,
          inputMode: values.inputMode,
          datasetVersionId:
            values.inputMode === 'DATASET_VERSION'
              ? values.datasetVersionId
              : undefined,
          inputObjectName:
            values.inputMode === 'SINGLE_OBJECT' ? inputObjectName : undefined,
          params,
          remark: values.remark,
        },
        { skipErrorHandler: true },
      );
      message.success('推理任务已创建');
      setInputFileList([]);
      taskForm.setFieldsValue({
        name: '',
        inputObjectName: '',
        remark: '',
      });
      actionRef.current?.reload();
      if (res?.data) {
        setSelectedTask(res.data);
        setDrawerOpen(true);
      }
    } catch (error: any) {
      message.error(error?.message || '创建推理任务失败');
    } finally {
      setCreating(false);
    }
  };

  const handleStopTask = async (task: InferenceTask) => {
    try {
      await stopInferenceTask(task.id, { skipErrorHandler: true });
      message.success('任务已停止');
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(error?.message || '停止任务失败');
    }
  };

  const downloadByObjectName = async (objectName: string, filename: string) => {
    if (!objectName) {
      message.warning('暂无可下载文件');
      return;
    }
    try {
      const blob = await downloadObject(objectName, { skipErrorHandler: true });
      triggerBlobDownload(blob, filename);
    } catch (error: any) {
      message.error(error?.message || '下载失败');
    }
  };

  const columns: ProColumns<InferenceTask>[] = [
    {
      title: '任务名称',
      dataIndex: 'name',
      ellipsis: true,
      width: 180,
    },
    {
      title: '输入',
      dataIndex: 'inputMode',
      width: 120,
      valueEnum: {
        SINGLE_OBJECT: { text: '单文件' },
        DATASET_VERSION: { text: '数据集' },
      },
      render: (_, record) =>
        record.inputMode === 'DATASET_VERSION' ? (
          <Tag color="blue">数据集</Tag>
        ) : (
          <Tag color="purple">单文件</Tag>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      valueEnum: Object.fromEntries(
        Object.entries(STATUS_MAP).map(([key, item]) => [
          key,
          { text: item.text },
        ]),
      ),
      render: (_, record) => statusTag(record.status),
    },
    {
      title: '进度',
      dataIndex: 'progress',
      hideInSearch: true,
      width: 150,
      render: (_, record) => (
        <Progress
          percent={record.progress ?? 0}
          size="small"
          status={record.status === 'failed' ? 'exception' : undefined}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      valueType: 'dateTime',
      hideInSearch: true,
      width: 170,
    },
    {
      title: '完成时间',
      dataIndex: 'finishedAt',
      valueType: 'dateTime',
      hideInSearch: true,
      width: 170,
    },
    {
      title: '操作',
      key: 'action',
      hideInSearch: true,
      fixed: 'right',
      width: 190,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            icon={<FileSearchOutlined />}
            onClick={() => {
              setSelectedTask(record);
              setDrawerOpen(true);
            }}
          >
            结果
          </Button>
          {['pending', 'queued', 'running'].includes(record.status) && (
            <Popconfirm
              title="停止推理任务"
              description="确认停止当前任务吗？"
              onConfirm={() => handleStopTask(record)}
            >
              <Button danger type="link" icon={<StopOutlined />}>
                停止
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="模型推理"
      subTitle="上传推理脚本，选择模型与输入数据，异步执行自定义推理任务"
      extra={[
        <Button key="reload" icon={<ReloadOutlined />} onClick={reloadAssets}>
          刷新资源
        </Button>,
        <Button
          key="script"
          icon={<CloudUploadOutlined />}
          onClick={() => setScriptModalOpen(true)}
        >
          上传脚本
        </Button>,
      ]}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <ProCard split="vertical" bordered bodyStyle={{ padding: 0 }}>
          <ProCard
            title="创建推理任务"
            colSpan={{ xs: 24, md: 9 }}
            style={{ minHeight: 620 }}
          >
            <Form
              form={taskForm}
              layout="vertical"
              initialValues={{
                inputMode: 'SINGLE_OBJECT',
                paramsJson: '{}',
              }}
              onValuesChange={(changed) => {
                if (changed.inputMode) setInputMode(changed.inputMode);
              }}
            >
              <Form.Item
                name="name"
                label="任务名称"
                rules={[{ required: true, message: '请输入任务名称' }]}
              >
                <Input placeholder="例如 smoke-single-inference" />
              </Form.Item>
              <Form.Item
                name="modelVersionId"
                label="模型版本"
                rules={[{ required: true, message: '请选择模型版本' }]}
              >
                <Select
                  showSearch
                  loading={loadingAssets}
                  options={modelSelectOptions}
                  optionFilterProp="label"
                  placeholder="选择训练产出的模型版本"
                />
              </Form.Item>
              <Form.Item
                name="scriptVersionId"
                label="推理脚本"
                rules={[{ required: true, message: '请选择推理脚本' }]}
              >
                <Select
                  showSearch
                  loading={loadingAssets}
                  options={scriptSelectOptions}
                  optionFilterProp="label"
                  placeholder="选择已上传脚本版本"
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Button
                        block
                        type="link"
                        icon={<UploadOutlined />}
                        onClick={() => setScriptModalOpen(true)}
                      >
                        上传新的推理脚本
                      </Button>
                    </>
                  )}
                />
              </Form.Item>
              <Form.Item name="inputMode" label="输入方式">
                <Radio.Group optionType="button" buttonStyle="solid">
                  <Radio.Button value="SINGLE_OBJECT">单文件</Radio.Button>
                  <Radio.Button value="DATASET_VERSION">
                    数据集版本
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>
              {inputMode === 'DATASET_VERSION' ? (
                <Form.Item
                  name="datasetVersionId"
                  label="数据集版本"
                  rules={[{ required: true, message: '请选择数据集版本' }]}
                >
                  <Select
                    showSearch
                    loading={loadingAssets}
                    options={datasetSelectOptions}
                    optionFilterProp="label"
                    placeholder="选择 READY 数据集版本"
                  />
                </Form.Item>
              ) : (
                <>
                  <Form.Item label="上传单文件">
                    <Upload
                      maxCount={1}
                      fileList={inputFileList}
                      beforeUpload={() => false}
                      onChange={({ fileList }) =>
                        setInputFileList(fileList.slice(-1))
                      }
                    >
                      <Button icon={<UploadOutlined />}>选择文件</Button>
                    </Upload>
                  </Form.Item>
                  <Form.Item name="inputObjectName" label="已有对象路径">
                    <Input placeholder="users/{userId}/files/..." />
                  </Form.Item>
                </>
              )}
              <Form.Item
                name="paramsJson"
                label="推理参数 JSON"
                rules={[
                  {
                    validator: async (_, value) => {
                      parseJson(value);
                    },
                  },
                ]}
              >
                <TextArea rows={6} placeholder='{"threshold":0.5}' />
              </Form.Item>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Button
                block
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={creating}
                onClick={handleCreateTask}
              >
                创建并执行
              </Button>
            </Form>
          </ProCard>
          <ProCard title="推理任务" colSpan={{ xs: 24, md: 15 }}>
            <ProTable<InferenceTask>
              actionRef={actionRef}
              columns={columns}
              rowKey="id"
              polling={3000}
              scroll={{ x: 900 }}
              search={{ labelWidth: 'auto' }}
              request={async (params) => {
                const res = await listInferenceTasks(
                  {
                    page: params.current,
                    pageSize: params.pageSize,
                    status: params.status as string | undefined,
                  },
                  { skipErrorHandler: true },
                );
                return {
                  data: res?.data?.data ?? [],
                  total: res?.data?.total ?? 0,
                  success: true,
                };
              }}
              pagination={{ pageSize: 10 }}
              toolBarRender={() => [
                <Button
                  key="reload"
                  icon={<ReloadOutlined />}
                  onClick={() => actionRef.current?.reload()}
                >
                  刷新
                </Button>,
              ]}
            />
          </ProCard>
        </ProCard>

        <ProCard
          title="推理脚本版本"
          bordered
          extra={
            <Button
              icon={<UploadOutlined />}
              onClick={() => setScriptModalOpen(true)}
            >
              上传脚本
            </Button>
          }
        >
          <ProTable<InferenceScriptVersion>
            rowKey="id"
            search={false}
            options={false}
            pagination={{ pageSize: 5 }}
            dataSource={scriptOptions}
            columns={[
              {
                title: '脚本名称',
                dataIndex: 'scriptName',
                ellipsis: true,
              },
              {
                title: '版本',
                dataIndex: 'version',
                width: 120,
              },
              {
                title: '入口文件',
                dataIndex: 'entryFile',
                ellipsis: true,
              },
              {
                title: '运行时',
                dataIndex: 'runtime',
                width: 120,
              },
              {
                title: '大小',
                dataIndex: 'sizeBytes',
                width: 120,
                render: (_, record) => formatInferenceBytes(record.sizeBytes),
              },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                valueType: 'dateTime',
                width: 170,
              },
            ]}
          />
        </ProCard>
      </Space>

      <Modal
        title="上传推理脚本"
        open={scriptModalOpen}
        onCancel={() => setScriptModalOpen(false)}
        onOk={handleUploadScript}
        confirmLoading={scriptUploading}
        destroyOnClose
      >
        <Form
          form={scriptForm}
          layout="vertical"
          initialValues={{
            version: 'v1',
            runtime: 'PYTHON3',
            entryFile: 'infer.py',
          }}
        >
          <Form.Item
            name="scriptName"
            label="脚本名称"
            rules={[{ required: true, message: '请输入脚本名称' }]}
          >
            <Input placeholder="例如 cv-classifier-infer" />
          </Form.Item>
          <Form.Item
            name="version"
            label="版本号"
            rules={[{ required: true, message: '请输入版本号' }]}
          >
            <Input placeholder="v1" />
          </Form.Item>
          <Form.Item name="runtime" label="运行时">
            <Select options={[{ label: 'Python 3', value: 'PYTHON3' }]} />
          </Form.Item>
          <Form.Item
            name="entryFile"
            label="入口文件"
            rules={[{ required: true, message: '请输入入口文件' }]}
          >
            <Input placeholder="infer.py" />
          </Form.Item>
          <Form.Item label="脚本 ZIP">
            <Upload
              maxCount={1}
              fileList={scriptFileList}
              beforeUpload={() => false}
              onChange={({ fileList }) => setScriptFileList(fileList.slice(-1))}
            >
              <Button icon={<UploadOutlined />}>选择 ZIP</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="paramsSchemaJson" label="参数表单 Schema JSON">
            <TextArea rows={4} placeholder='{"threshold":{"type":"number"}}' />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="推理结果"
        open={drawerOpen}
        width={680}
        onClose={() => setDrawerOpen(false)}
        extra={selectedTask ? statusTag(selectedTask.status) : null}
      >
        {selectedTask && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="任务 ID">
                {selectedTask.id}
              </Descriptions.Item>
              <Descriptions.Item label="任务名称">
                {selectedTask.name}
              </Descriptions.Item>
              <Descriptions.Item label="模型版本">
                {selectedTask.modelVersionId}
              </Descriptions.Item>
              <Descriptions.Item label="脚本版本">
                {selectedTask.scriptVersionId}
              </Descriptions.Item>
              <Descriptions.Item label="输入">
                {selectedTask.inputMode === 'DATASET_VERSION'
                  ? selectedTask.datasetVersionId
                  : selectedTask.inputObjectName}
              </Descriptions.Item>
              <Descriptions.Item label="进度">
                <Progress
                  percent={selectedTask.progress ?? 0}
                  size="small"
                  status={
                    selectedTask.status === 'failed' ? 'exception' : undefined
                  }
                />
              </Descriptions.Item>
              {selectedTask.errorMessage && (
                <Descriptions.Item label="错误信息">
                  <Typography.Text type="danger">
                    {selectedTask.errorMessage}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="输出目录">
                <Typography.Text copyable ellipsis style={{ maxWidth: 480 }}>
                  {selectedTask.outputPath || '-'}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="日志文件">
                <Typography.Text copyable ellipsis style={{ maxWidth: 480 }}>
                  {selectedTask.logPath || '-'}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
            <Space wrap>
              <Button
                icon={<DownloadOutlined />}
                disabled={!selectedTask.outputPath}
                onClick={() =>
                  downloadByObjectName(
                    minioPathToResultObject(selectedTask.outputPath),
                    `${selectedTask.id}-result.json`,
                  )
                }
              >
                下载结果
              </Button>
              <Button
                icon={<DownloadOutlined />}
                disabled={!selectedTask.logPath}
                onClick={() =>
                  downloadByObjectName(
                    objectNameFromMinioPath(selectedTask.logPath),
                    `${selectedTask.id}.log`,
                  )
                }
              >
                下载日志
              </Button>
            </Space>
            <Typography.Title level={5}>结构化结果</Typography.Title>
            <pre
              style={{
                margin: 0,
                padding: 12,
                minHeight: 160,
                maxHeight: 360,
                overflow: 'auto',
                background: '#111827',
                color: '#e5e7eb',
                borderRadius: 6,
              }}
            >
              {JSON.stringify(selectedTask.result || {}, null, 2)}
            </pre>
          </Space>
        )}
      </Drawer>
    </PageContainer>
  );
};

export default InferenceWorkbench;
