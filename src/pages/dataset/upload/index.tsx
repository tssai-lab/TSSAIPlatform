import { UploadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useSearchParams } from '@umijs/max';
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
import React, { useEffect, useMemo, useState } from 'react';
import { UPLOAD_CONFIG } from '@/constants/platform';
import type {
  AnnotationFormat,
  CvTaskType,
  DatasetType,
  MultimodalSampleGrouping,
} from '@/services/dataset';
import { fetchDatasetDetail, uploadDataset } from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  DATASET_VERSION_DESC_PLACEHOLDER,
  DATASET_VERSION_FORMAT_HINT,
  datasetVersionDescFormRules,
  datasetVersionFormRules,
  suggestNextDatasetVersion,
} from '@/utils/datasetVersion';
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
 * 数据集上传：CV/NLP/POINT_CLOUD、版本、版本描述、单文件分片与 CV 多文件文件夹（module2-api-doc）
 */
const DatasetUpload: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const datasetType = Form.useWatch('type', form) as DatasetType | undefined;
  const sampleGrouping = Form.useWatch('sampleGrouping', form) as
    | MultimodalSampleGrouping
    | undefined;
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [resumeHint, setResumeHint] = useState<string | null>(null);
  const [existingVersions, setExistingVersions] = useState<string[]>([]);
  const [prefillLoading, setPrefillLoading] = useState(false);

  const assetId = searchParams.get('assetId') ?? undefined;
  const isNewVersionUpload = !!assetId;

  useEffect(() => {
    const id = localStorage.getItem(LS_DATASET_UPLOAD_ID);
    const fp = localStorage.getItem(LS_DATASET_UPLOAD_FP);
    if (id && fp) {
      setResumeHint(
        '检测到未完成的数据集分片上传。请保持数据集名称、版本、类型与上次一致，并重新选择同一文件后提交，系统将跳过已上传分片。',
      );
    }
  }, []);

  useEffect(() => {
    const datasetName = searchParams.get('datasetName');
    const type = searchParams.get('type') as DatasetType | null;
    if (datasetName) {
      form.setFieldValue('name', datasetName);
    }
    if (type && ['CV', 'NLP', 'POINT_CLOUD', 'MULTIMODAL'].includes(type)) {
      form.setFieldValue('type', type);
    }

    if (!assetId) {
      setExistingVersions([]);
      return;
    }

    setPrefillLoading(true);
    fetchDatasetDetail(assetId, { skipErrorHandler: true })
      .then((res) => {
        const detail = res?.data;
        if (!detail) return;
        form.setFieldsValue({
          name: detail.name,
          type: detail.type,
        });
        const versions = detail.versions.map((v) => v.version).filter(Boolean);
        setExistingVersions(versions);
        form.setFieldValue('version', suggestNextDatasetVersion(versions));
      })
      .catch(() => {
        message.warning('未能加载已有版本信息，请手动填写版本号');
      })
      .finally(() => setPrefillLoading(false));
  }, [assetId, form, searchParams]);

  const versionRules = useMemo(
    () => datasetVersionFormRules(existingVersions),
    [existingVersions],
  );

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
    const version = (values.version || 'v1.0.0').trim();
    const type = values.type as DatasetType;
    const remark = values.remark?.trim();
    const multimodalGrouping = values.sampleGrouping as
      | MultimodalSampleGrouping
      | undefined;
    const manifestPath = values.manifestPath?.trim();
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

    if (type === 'MULTIMODAL') {
      if (files.length !== 1) {
        message.error('多模态数据集仅支持上传单个 zip 文件');
        return;
      }
      if (!files[0].name.toLowerCase().endsWith('.zip')) {
        message.error('多模态数据集仅支持 .zip 格式');
        return;
      }
    }

    setUploading(true);
    setUploadPercent(0);
    const requestOpts = { skipErrorHandler: true } as const;

    try {
      let createdAssetId: string | undefined;
      if (files.length === 1) {
        const file = files[0];
        const fp = buildDatasetFileFingerprint(file, name, version, type);
        const uploadRes = await uploadDataset(
          {
            name,
            files,
            type,
            version,
            assetId,
            cvTaskType,
            annotationFormat,
            remark,
            sampleGrouping:
              type === 'MULTIMODAL'
                ? (multimodalGrouping ?? 'AUTO_DIRECTORY')
                : undefined,
            manifestPath:
              type === 'MULTIMODAL' &&
              (multimodalGrouping ?? 'AUTO_DIRECTORY') === 'MANIFEST'
                ? manifestPath
                : undefined,
            fileFingerprint: fp,
            onProgress: (p) => setUploadPercent(p),
            onUploadSession: ({ uploadId, fileFingerprint: fgp }) => {
              localStorage.setItem(LS_DATASET_UPLOAD_ID, uploadId);
              localStorage.setItem(LS_DATASET_UPLOAD_FP, fgp);
            },
          },
          requestOpts,
        );
        createdAssetId = uploadRes?.data?.assetId;
        if (type === 'MULTIMODAL' && uploadRes?.data?.importJobId) {
          message.info(
            multimodalGrouping === 'MANIFEST'
              ? 'zip 上传完成，后台正在解析 manifest 并导入样本，请在详情页查看导入进度。'
              : 'zip 上传完成，后台正在按目录结构导入样本，请在详情页查看导入进度。',
          );
        }
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
      message.success(
        type === 'MULTIMODAL' ? 'zip 上传成功，正在后台导入样本' : '上传成功！',
      );
      const detailAssetId = assetId || createdAssetId;
      if (detailAssetId && type === 'MULTIMODAL') {
        history.push(`/dataset/detail/${encodeURIComponent(detailAssetId)}`);
      } else if (assetId) {
        history.push(`/dataset/detail/${encodeURIComponent(assetId)}`);
      } else {
        history.push('/dataset/list');
      }
    } catch (error: any) {
      message.error(getApiErrorMessage(error));
    } finally {
      setUploading(false);
      setUploadPercent(0);
    }
  };

  const backPath = assetId
    ? `/dataset/detail/${encodeURIComponent(assetId)}`
    : '/dataset/list';

  return (
    <PageContainer
      title={isNewVersionUpload ? '上传新版本' : '上传数据集'}
      subTitle={
        isNewVersionUpload
          ? '为已有数据集资产上传新版本文件，版本号须符合 vX.Y.Z 规范且不可重复'
          : '首次上传将创建数据集资产；版本号采用 vX.Y.Z 语义化命名'
      }
      onBack={() => history.push(backPath)}
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
      <Alert
        type="info"
        showIcon
        message="版本命名规范"
        description={
          <>
            {DATASET_VERSION_FORMAT_HINT}
            。每个版本须填写「版本描述」，说明更新原因与内容（存入后端 remark
            字段）。
          </>
        }
        style={{ marginBottom: 16 }}
      />
      <Form
        form={form}
        onFinish={handleSubmit}
        layout="vertical"
        initialValues={{
          type: 'CV',
          version: 'v1.0.0',
          sampleGrouping: 'AUTO_DIRECTORY',
        }}
      >
        <Form.Item
          name="name"
          label="数据集名称"
          rules={[{ required: true, message: '请输入数据集名称' }]}
          extra={
            isNewVersionUpload
              ? '上传新版本时须与已有资产名称一致，否则将创建新数据集'
              : undefined
          }
        >
          <Input
            placeholder="请输入数据集名称"
            readOnly={isNewVersionUpload}
            disabled={prefillLoading}
          />
        </Form.Item>
        <Form.Item
          name="version"
          label="版本号"
          rules={versionRules}
          extra={DATASET_VERSION_FORMAT_HINT}
        >
          <Input placeholder="例如 v1.0.0" disabled={prefillLoading} />
        </Form.Item>
        <Form.Item
          name="type"
          label="任务类型"
          rules={[{ required: true, message: '请选择类型' }]}
        >
          <Select
            disabled={isNewVersionUpload || prefillLoading}
            onChange={(value) => {
              form.setFieldValue('files', []);
              form.setFieldValue('cvTaskType', undefined);
              form.setFieldValue('annotationFormat', undefined);
              if (value === 'MULTIMODAL') {
                form.setFieldValue('sampleGrouping', 'AUTO_DIRECTORY');
                form.setFieldValue('manifestPath', undefined);
              }
            }}
          >
            <Select.Option value="CV">CV</Select.Option>
            <Select.Option value="NLP">NLP</Select.Option>
            <Select.Option value="POINT_CLOUD">
              点云（POINT_CLOUD）
            </Select.Option>
            <Select.Option value="MULTIMODAL">
              多模态（MULTIMODAL）
            </Select.Option>
          </Select>
        </Form.Item>
        {datasetType === 'MULTIMODAL' && (
          <>
            <Form.Item
              name="sampleGrouping"
              label="样本分组方式"
              rules={[{ required: true, message: '请选择样本分组方式' }]}
              extra="AUTO_DIRECTORY 无需 manifest；MANIFEST 需在 zip 内提供 manifest 索引文件"
            >
              <Select>
                <Select.Option value="AUTO_DIRECTORY">
                  自动目录（AUTO_DIRECTORY，推荐）
                </Select.Option>
                <Select.Option value="MANIFEST">
                  Manifest 索引（MANIFEST）
                </Select.Option>
              </Select>
            </Form.Item>
            {sampleGrouping === 'MANIFEST' && (
              <Form.Item
                name="manifestPath"
                label="Manifest 路径"
                extra="zip 内 manifest 相对路径，留空则默认 manifest.json"
              >
                <Input placeholder="例如 metadata/manifest.json" />
              </Form.Item>
            )}
            {sampleGrouping === 'AUTO_DIRECTORY' && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="AUTO_DIRECTORY zip 结构要求"
                description={
                  <>
                    zip 根目录须直接为样本目录（如
                    scene_001/、scene_002/），根级不能有普通文件。
                    每个样本目录内：annotations/ 下为标注文件，其余为数据文件。
                    目录名即 externalId；无需 manifest.json。
                  </>
                }
              />
            )}
          </>
        )}
        {datasetType === 'CV' && (
          <>
            <Form.Item name="cvTaskType" label="CV 子任务类型">
              <Select allowClear placeholder="请选择 CV 子任务">
                <Select.Option value="IMAGE_CLASSIFICATION">
                  图像分类
                </Select.Option>
                <Select.Option value="OBJECT_DETECTION">目标检测</Select.Option>
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
        <Form.Item
          name="remark"
          label="版本描述"
          rules={datasetVersionDescFormRules()}
          extra="记录本版本的更新原因与内容，便于长期维护与训练选型"
        >
          <Input.TextArea
            rows={4}
            placeholder={DATASET_VERSION_DESC_PLACEHOLDER}
            showCount
            maxLength={2000}
          />
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
            multiple={
              datasetType !== 'POINT_CLOUD' &&
              datasetType !== 'NLP' &&
              datasetType !== 'MULTIMODAL'
            }
            accept={
              datasetType === 'POINT_CLOUD'
                ? POINT_CLOUD_ACCEPT
                : datasetType === 'MULTIMODAL'
                  ? '.zip'
                  : undefined
            }
            beforeUpload={() => false}
            onChange={(e) => {
              let fileList = e.fileList ?? [];
              if (
                (datasetType === 'POINT_CLOUD' ||
                  datasetType === 'MULTIMODAL') &&
                fileList.length > 1
              ) {
                fileList = fileList.slice(-1);
                message.info('当前类型仅支持单个文件，已保留最新选择');
              }
              form.setFieldValue('files', fileList);
            }}
          >
            <Button icon={<UploadOutlined />}>
              {datasetType === 'POINT_CLOUD'
                ? '选择点云文件（.ply / .pcd / .zip）'
                : datasetType === 'MULTIMODAL'
                  ? '选择多模态 zip（单文件分片上传）'
                  : '选择文件（单文件 zip 支持断点续传；CV 可多选图片目录）'}
            </Button>
          </Upload>
          <div style={{ marginTop: 8, color: '#999' }}>
            单文件最大 {UPLOAD_CONFIG.DATASET.MAX_SIZE / 1024 / 1024 / 1024}
            GB。
            {datasetType === 'POINT_CLOUD'
              ? ' 点云仅支持单个 .ply、.pcd 或 .zip；zip 内需至少包含一个 .ply 或 .pcd。'
              : datasetType === 'MULTIMODAL'
                ? sampleGrouping === 'MANIFEST'
                  ? ' MANIFEST 模式：zip 须含 manifest.json（或指定路径）；上传后 DRAFT，后台异步导入。'
                  : ' AUTO_DIRECTORY：zip 根目录为样本子目录，无需 manifest；上传后 DRAFT，后台异步导入。'
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
            <Button onClick={() => history.push(backPath)} disabled={uploading}>
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
