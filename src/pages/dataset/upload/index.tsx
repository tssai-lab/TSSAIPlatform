import { UploadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import type { UploadFile } from 'antd';
import {
  Alert,
  Button,
  Form,
  Input,
  message,
  Progress,
  Select,
  Space,
  Upload,
} from 'antd';
import React, { useEffect, useState } from 'react';
import { UPLOAD_CONFIG } from '@/constants/platform';
import type {
  AnnotationFormat,
  CvTaskType,
  TaskType,
} from '@/services/dataset';
import { uploadDataset } from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  buildDatasetFileFingerprint,
  LS_DATASET_UPLOAD_FP,
  LS_DATASET_UPLOAD_ID,
} from '@/utils/uploadResume';

const POINT_CLOUD_ACCEPT = '.ply,.pcd,.zip';

function isPointCloudFileName(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext === 'ply' || ext === 'pcd' || ext === 'zip';
}

/**
 * 数据集上传：CV/NLP/POINT_CLOUD、版本、备注、单文件分片与 CV 多文件文件夹（module2-api-doc）
 */
const DatasetUpload: React.FC = () => {
  const [form] = Form.useForm();
  const datasetType = Form.useWatch('type', form) as TaskType | undefined;
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [resumeHint, setResumeHint] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem(LS_DATASET_UPLOAD_ID);
    const fp = localStorage.getItem(LS_DATASET_UPLOAD_FP);
    if (id && fp) {
      setResumeHint(
        '检测到未完成的数据集分片上传。请保持数据集名称、版本、类型与上次一致，并重新选择同一文件后提交，系统将跳过已上传分片。',
      );
    }
  }, []);

  const clearResumeStorage = () => {
    localStorage.removeItem(LS_DATASET_UPLOAD_ID);
    localStorage.removeItem(LS_DATASET_UPLOAD_FP);
    setResumeHint(null);
  };

  const handleSubmit = async (values: any) => {
    const fileList = (values.files ?? []) as UploadFile[];
    const files = fileList
      .map((f) => f.originFileObj)
      .filter(Boolean) as File[];
    if (!files.length) {
      message.error('请选择要上传的文件');
      return;
    }
    const name = values.name?.trim();
    if (!name) {
      message.error('请输入数据集名称');
      return;
    }
    const version = (values.version || 'v1').trim();
    const type = values.type as TaskType;
    const remark = values.remark?.trim();
    const cvTaskType = values.cvTaskType as CvTaskType | undefined;
    const annotationFormat = values.annotationFormat as
      | AnnotationFormat
      | undefined;

    const maxBytes = UPLOAD_CONFIG.DATASET.MAX_SIZE;
    for (const f of files) {
      if (f.size > maxBytes) {
        message.error(`单个文件不能超过 ${maxBytes / 1024 / 1024 / 1024}GB`);
        return;
      }
    }

    if (type === 'POINT_CLOUD') {
      if (files.length !== 1) {
        message.error('点云数据集仅支持上传单个 .ply、.pcd 或 .zip 文件');
        return;
      }
      if (!isPointCloudFileName(files[0].name)) {
        message.error('点云数据集仅支持 .ply、.pcd 或 .zip 格式');
        return;
      }
    }

    setUploading(true);
    setUploadPercent(0);
    const requestOpts = { skipErrorHandler: true } as const;

    try {
      if (files.length === 1) {
        const file = files[0];
        const fp = buildDatasetFileFingerprint(file, name, version, type);
        await uploadDataset(
          {
            name,
            files,
            type,
            version,
            cvTaskType,
            annotationFormat,
            remark,
            fileFingerprint: fp,
            onProgress: (p) => setUploadPercent(p),
            onUploadSession: ({ uploadId, fileFingerprint: fgp }) => {
              localStorage.setItem(LS_DATASET_UPLOAD_ID, uploadId);
              localStorage.setItem(LS_DATASET_UPLOAD_FP, fgp);
            },
          },
          requestOpts,
        );
      } else {
        if (type === 'NLP' || type === 'POINT_CLOUD') {
          message.error(
            type === 'POINT_CLOUD'
              ? '点云数据集仅支持单个 .ply、.pcd 或 .zip 文件'
              : 'NLP 数据集请将多个文件打包为 zip 后作为单个文件上传',
          );
          setUploading(false);
          return;
        }
        await uploadDataset(
          {
            name,
            files,
            type: 'CV',
            version,
            cvTaskType,
            annotationFormat,
            remark,
          },
          requestOpts,
        );
        setUploadPercent(100);
      }
      clearResumeStorage();
      message.success('上传成功！');
      history.push('/dataset/list');
    } catch (error: any) {
      message.error(getApiErrorMessage(error));
    } finally {
      setUploading(false);
      setUploadPercent(0);
    }
  };

  return (
    <PageContainer
      title="上传数据集"
      onBack={() => history.push('/dataset/list')}
    >
      {resumeHint && (
        <Alert
          type="info"
          showIcon
          closable
          onClose={() => setResumeHint(null)}
          message="断点续传"
          description={resumeHint}
          style={{ marginBottom: 16 }}
        />
      )}
      <Form
        form={form}
        onFinish={handleSubmit}
        layout="vertical"
        initialValues={{ type: 'CV', version: 'v1' }}
      >
        <Form.Item
          name="name"
          label="数据集名称"
          rules={[{ required: true, message: '请输入数据集名称' }]}
        >
          <Input placeholder="请输入数据集名称" />
        </Form.Item>
        <Form.Item
          name="version"
          label="版本号"
          rules={[{ required: true, message: '请输入版本号' }]}
        >
          <Input placeholder="默认 v1" />
        </Form.Item>
        <Form.Item
          name="type"
          label="任务类型"
          rules={[{ required: true, message: '请选择类型' }]}
        >
          <Select
            onChange={() => {
              form.setFieldValue('files', []);
              form.setFieldValue('cvTaskType', undefined);
              form.setFieldValue('annotationFormat', undefined);
            }}
          >
            <Select.Option value="CV">CV</Select.Option>
            <Select.Option value="NLP">NLP</Select.Option>
            <Select.Option value="POINT_CLOUD">
              点云（POINT_CLOUD）
            </Select.Option>
          </Select>
        </Form.Item>
        {datasetType === 'CV' && (
          <>
            <Form.Item name="cvTaskType" label="CV 子任务类型">
              <Select allowClear placeholder="请选择 CV 子任务">
                <Select.Option value="IMAGE_CLASSIFICATION">
                  图像分类
                </Select.Option>
                <Select.Option value="OBJECT_DETECTION">
                  目标检测
                </Select.Option>
                <Select.Option value="SEMANTIC_SEGMENTATION">
                  语义分割
                </Select.Option>
                <Select.Option value="INSTANCE_SEGMENTATION">
                  实例分割
                </Select.Option>
                <Select.Option value="UNLABELED">未标注</Select.Option>
                <Select.Option value="OTHER">其它</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="annotationFormat"
              label="标注格式"
              extra="YOLO/COCO 等带标注 zip 请选择对应格式；仅图片可选 NONE"
            >
              <Select allowClear placeholder="请选择标注格式">
                <Select.Option value="NONE">NONE（仅图片）</Select.Option>
                <Select.Option value="FOLDER_CLASSIFICATION">
                  FOLDER_CLASSIFICATION
                </Select.Option>
                <Select.Option value="YOLO">YOLO</Select.Option>
                <Select.Option value="COCO">COCO</Select.Option>
                <Select.Option value="VOC">VOC</Select.Option>
                <Select.Option value="CSV">CSV</Select.Option>
                <Select.Option value="MASK">MASK</Select.Option>
                <Select.Option value="LABELME">LABELME</Select.Option>
                <Select.Option value="OTHER">OTHER</Select.Option>
              </Select>
            </Form.Item>
          </>
        )}
        <Form.Item name="remark" label="备注（可选）">
          <Input.TextArea rows={3} placeholder="将传给后端 init 的 remark" />
        </Form.Item>
        <Form.Item
          name="files"
          label="文件"
          valuePropName="fileList"
          getValueFromEvent={(e) => e?.fileList ?? []}
          rules={[
            {
              required: true,
              validator: (_, value) => {
                const list = Array.isArray(value) ? value : [];
                if (
                  !list.length ||
                  !list.some((x: UploadFile) => x.originFileObj)
                ) {
                  return Promise.reject(new Error('请上传文件'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Upload
            multiple={datasetType !== 'POINT_CLOUD' && datasetType !== 'NLP'}
            accept={
              datasetType === 'POINT_CLOUD' ? POINT_CLOUD_ACCEPT : undefined
            }
            beforeUpload={() => false}
            onChange={(e) => {
              let fileList = e.fileList ?? [];
              if (datasetType === 'POINT_CLOUD' && fileList.length > 1) {
                fileList = fileList.slice(-1);
                message.info('点云数据集仅支持单个文件，已保留最新选择');
              }
              form.setFieldValue('files', fileList);
            }}
          >
            <Button icon={<UploadOutlined />}>
              {datasetType === 'POINT_CLOUD'
                ? '选择点云文件（.ply / .pcd / .zip）'
                : '选择文件（单文件 zip 支持断点续传；CV 可多选图片目录）'}
            </Button>
          </Upload>
          <div style={{ marginTop: 8, color: '#999' }}>
            单文件最大 {UPLOAD_CONFIG.DATASET.MAX_SIZE / 1024 / 1024 / 1024}
            GB。
            {datasetType === 'POINT_CLOUD'
              ? ' 点云仅支持单个 .ply、.pcd 或 .zip；zip 内需至少包含一个 .ply 或 .pcd。'
              : ' CV 带 YOLO/COCO 等标注的 zip 请选择对应标注格式；多文件将走文件夹打包；大 zip 请单文件分片上传。'}
          </div>
        </Form.Item>
        {uploading && (
          <Form.Item label="上传进度">
            <Progress percent={uploadPercent} status="active" />
          </Form.Item>
        )}
        <Form.Item>
          <Space>
            <Button
              onClick={() => history.push('/dataset/list')}
              disabled={uploading}
            >
              取消
            </Button>
            <Button
              danger
              type="default"
              disabled={uploading}
              onClick={clearResumeStorage}
            >
              清除本地续传记录
            </Button>
            <Button type="primary" htmlType="submit" loading={uploading}>
              提交
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </PageContainer>
  );
};

export default DatasetUpload;
