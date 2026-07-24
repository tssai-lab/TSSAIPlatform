import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import { Button, message, Popconfirm, Space, Tag, Typography } from 'antd';
import React, { useRef } from 'react';
import { isTrainingCodeAutoApproveEnabled } from '@/constants/trainingCode';
import type { CodeVersionListItem } from '@/services/code';
import {
  approveCodeVersion,
  deleteCodeAsset,
  downloadCodeVersionZip,
  fetchCodeVersionList,
  getCodeUserDisplayName,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import { removePendingCodeVersion } from '@/utils/pendingCodeVersions';

function approvalTag(status?: string) {
  if (status === 'APPROVED') {
    return <Tag color="success">APPROVED</Tag>;
  }
  if (status === 'PENDING') {
    return <Tag color="warning">PENDING</Tag>;
  }
  return <Tag>{status || '-'}</Tag>;
}

function statusTag(status?: string) {
  if (status === 'READY') {
    return <Tag color="success">READY</Tag>;
  }
  return <Tag>{status || '-'}</Tag>;
}

const TrainingCodeList: React.FC = () => {
  const access = useAccess();
  const actionRef = useRef<ActionType | null>(null);

  const requestList = async (params: {
    codeAssetName?: string;
    current?: number;
    pageSize?: number;
  }) => {
    try {
      const res = await fetchCodeVersionList(
        {
          ...(params.codeAssetName?.trim()
            ? { codeName: params.codeAssetName.trim() }
            : {}),
        },
        { skipErrorHandler: true },
      );
      if (res?.success === false) {
        message.error(res?.errorMessage || '训练代码列表加载失败');
        return { data: [], success: false, total: 0 };
      }
      let list = Array.isArray(res?.data) ? res.data : [];
      const keyword = params.codeAssetName?.trim()?.toLowerCase();
      if (keyword) {
        list = list.filter((item) =>
          item.codeAssetName?.toLowerCase().includes(keyword),
        );
      }
      return {
        data: list,
        success: true,
        total: res?.total ?? list.length,
      };
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '训练代码列表加载失败'));
      return { data: [], success: false, total: 0 };
    }
  };

  const handleApprove = async (codeVersionId: string) => {
    try {
      const res = await approveCodeVersion(codeVersionId, {
        skipErrorHandler: true,
      });
      if (res?.success === false) {
        message.error(res?.errorMessage || '审核失败');
        return;
      }
      message.success('训练代码版本已审核通过');
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '审核失败'));
    }
  };

  const handleDelete = async (record: CodeVersionListItem) => {
    const assetId = record.codeAssetId?.trim();
    if (!assetId) {
      message.error('缺少 codeAssetId，无法删除');
      return;
    }
    try {
      await deleteCodeAsset(assetId, { skipErrorHandler: true });
      removePendingCodeVersion(record.codeVersionId);
      message.success('已删除训练代码资产');
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '删除训练代码失败'));
    }
  };

  const handleDownload = async (record: CodeVersionListItem) => {
    try {
      await downloadCodeVersionZip(
        record.codeVersionId,
        record.fileName || `${record.codeVersionId}.zip`,
        { skipErrorHandler: true },
      );
      message.success('开始下载');
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '下载失败'));
    }
  };

  const columns: ProColumns<CodeVersionListItem>[] = [
    {
      title: '代码名称',
      dataIndex: 'codeAssetName',
      key: 'codeAssetName',
      width: 160,
      ellipsis: true,
      render: (_, record) => getCodeUserDisplayName(record),
    },
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      width: 180,
      ellipsis: true,
      hideInSearch: true,
      render: (_, record) => record.fileName?.trim() || '-',
    },
    {
      title: '训练方案',
      dataIndex: 'trainingProfile',
      key: 'trainingProfile',
      ellipsis: true,
      hideInSearch: true,
      width: 220,
    },
    {
      title: '审核状态',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 110,
      hideInSearch: true,
      render: (_, record) => approvalTag(record.approvalStatus),
    },
    {
      title: '校验状态',
      dataIndex: 'validationStatus',
      key: 'validationStatus',
      width: 110,
      hideInSearch: true,
      render: (_, record) => record.validationStatus || '-',
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 100,
      hideInSearch: true,
      render: (_, record) => record.riskLevel || '-',
    },
    {
      title: '就绪状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      hideInSearch: true,
      render: (_, record) => statusTag(record.status),
    },
    {
      title: 'codeVersionId',
      dataIndex: 'codeVersionId',
      key: 'codeVersionId',
      hideInSearch: true,
      ellipsis: true,
      width: 180,
      render: (_, record) => (
        <Typography.Text copyable code style={{ fontSize: 12 }}>
          {record.codeVersionId}
        </Typography.Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      hideInSearch: true,
      render: (_, record) => (
        <Space size={0} wrap>
          <Button
            type="link"
            style={{ paddingLeft: 0 }}
            onClick={() =>
              history.push(
                `/task/code/detail/${encodeURIComponent(record.codeVersionId)}`,
                { record, from: 'list' },
              )
            }
          >
            查看
          </Button>
          <Button type="link" onClick={() => handleDownload(record)}>
            下载
          </Button>
          {access.isAdmin && record.approvalStatus !== 'APPROVED' && (
            <Button
              type="link"
              onClick={() => handleApprove(record.codeVersionId)}
            >
              审核通过
            </Button>
          )}
          <Popconfirm
            title="删除训练代码资产？"
            description="将软删除整个代码资产（含其下版本）。若已被训练引用或存在打开工作区，删除会失败。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Button type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="训练代码"
      subTitle={
        isTrainingCodeAutoApproveEnabled()
          ? '当前为自动审核：上传/发布后默认通过，可直接用于发起训练（READY + APPROVED）'
          : '训练页仅可使用 READY + APPROVED 的代码版本；详情页补充展示校验、风险与消费清单字段'
      }
      extra={[
        access.isAdmin && !isTrainingCodeAutoApproveEnabled() ? (
          <Button
            key="pending"
            onClick={() => history.push('/task/code/pending')}
          >
            待审核
          </Button>
        ) : null,
        <Button
          key="upload"
          type="primary"
          onClick={() => history.push('/task/code/upload')}
        >
          + 上传训练代码
        </Button>,
      ]}
    >
      <ProTable<CodeVersionListItem>
        actionRef={actionRef}
        columns={columns}
        request={requestList}
        rowKey="codeVersionId"
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10 }}
        // 无 width 的 ellipsis 列在窄屏会被挤成 0 宽（列设置仍显示已勾选）
        scroll={{ x: 1420 }}
      />
    </PageContainer>
  );
};

export default TrainingCodeList;
