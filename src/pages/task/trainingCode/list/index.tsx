import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import {
  Button,
  Modal,
  message,
  Popconfirm,
  Space,
  Tag,
  Typography,
} from 'antd';
import React, { useRef } from 'react';
import type { CodeVersionListItem } from '@/services/code';
import {
  approveCodeVersion,
  CONSISTENCY_TRAINING_PROFILE,
  checkCodeVersionForTraining,
  deleteCodeVersion,
  fetchCodeVersionList,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';

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
  const actionRef = useRef<ActionType>();

  const requestList = async (params: {
    codeAssetName?: string;
    current?: number;
    pageSize?: number;
  }) => {
    try {
      const res = await fetchCodeVersionList(
        {
          codeName: params.codeAssetName?.trim(),
          current: params.current,
          pageSize: params.pageSize,
        },
        { skipErrorHandler: true },
      );
      if (res?.success === false) {
        message.error(res?.errorMessage || '训练代码列表加载失败');
        return { data: [], success: false, total: 0 };
      }
      let list = res?.data ?? [];
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

  const runTrainingCheck = async (record: CodeVersionListItem) => {
    try {
      const res = await checkCodeVersionForTraining(
        record.codeVersionId,
        record.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
        { skipErrorHandler: true },
      );
      if (res?.success === false) {
        message.error(res?.errorMessage || '准入校验失败');
        return;
      }
      const data = res?.data;
      Modal.info({
        title: data?.passed ? '准入校验通过' : '准入校验未通过',
        width: 520,
        content: (
          <div>
            <p>approvalStatus：{data?.approvalStatus || '-'}</p>
            {(data?.reasons?.length ?? 0) > 0 && (
              <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                {data?.reasons?.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        ),
      });
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '准入校验失败'));
    }
  };

  const handleDelete = async (record: CodeVersionListItem) => {
    try {
      const res = await deleteCodeVersion(record.codeVersionId, {
        skipErrorHandler: true,
      });
      if (res?.success === false) {
        message.error(res?.errorMessage || '删除失败');
        return;
      }
      message.success('训练代码版本已删除');
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '删除失败'));
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

  const columns: ProColumns<CodeVersionListItem>[] = [
    {
      title: '代码名称',
      dataIndex: 'codeAssetName',
      key: 'codeAssetName',
      ellipsis: true,
    },
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      hideInSearch: true,
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
                { record },
              )
            }
          >
            查看
          </Button>
          <Button type="link" onClick={() => runTrainingCheck(record)}>
            准入校验
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
            title="确认删除该训练代码版本？"
            description="若已被训练任务引用将无法删除。"
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
      subTitle="管理已上传的训练代码资产，供发起训练时选用"
      extra={[
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
      />
    </PageContainer>
  );
};

export default TrainingCodeList;
