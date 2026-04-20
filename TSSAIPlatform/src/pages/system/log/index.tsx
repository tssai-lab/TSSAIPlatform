import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import React from 'react';

/**
 * 审计日志页（超管专属）
 */
const AuditLog: React.FC = () => {
  // TODO: 调用接口 GET /api/sys/log/list
  const fetchLogList = async (params: any) => {
    console.log('查询参数:', params);
    return {
      data: [],
      success: true,
      total: 0,
    };
  };

  const handleExport = () => {
    // TODO: 调用接口 GET /api/sys/log/export
    console.log('导出日志');
  };

  const columns: ProColumns<API.LogItem>[] = [
    {
      title: '操作人',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '操作类型',
      dataIndex: 'operateType',
      key: 'operateType',
    },
    {
      title: '操作时间',
      dataIndex: 'operateTime',
      key: 'operateTime',
      valueType: 'dateTime',
    },
    {
      title: 'IP地址',
      dataIndex: 'ip',
      key: 'ip',
    },
    {
      title: '操作内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
    },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      valueEnum: {
        success: { text: '成功', status: 'Success' },
        failed: { text: '失败', status: 'Error' },
      },
    },
  ];

  return (
    <PageContainer
      extra={[
        <Button key="export" onClick={handleExport}>
          导出Excel
        </Button>,
      ]}
    >
      <ProTable
        columns={columns}
        request={fetchLogList}
        rowKey="id"
        search={{
          labelWidth: 'auto',
          optionRender: false,
        }}
        pagination={{
          pageSize: 10,
        }}
      />
    </PageContainer>
  );
};

export default AuditLog;




