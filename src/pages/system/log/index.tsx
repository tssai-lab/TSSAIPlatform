import type {
  ActionType,
  ParamsType,
  ProColumns,
} from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import { Button, message, Tabs } from 'antd';
import type { SortOrder } from 'antd/es/table/interface';
import dayjs from 'dayjs';
import React, { useEffect, useRef, useState } from 'react';
import {
  exportLog,
  fetchLogList as fetchLogListService,
  type LogItem,
  type LogListParams,
} from '@/services/system';
import { toProTableFail, toProTableSuccess, withIndex } from '@/utils/proTable';

type LogTypeTab = 'system' | 'operation';

/**
 * 日志管理页
 * 超管：系统日志+操作日志、全部操作人（含管理员）、IP、导出
 * 普管：仅普通用户操作日志、操作人仅普通用户姓名、无IP列、无导出
 */
const LogManagement: React.FC = () => {
  const access = useAccess();
  const actionRef = useRef<ActionType>(null);
  const [activeTab, setActiveTab] = useState<LogTypeTab>('operation');
  const [currentParams, setCurrentParams] = useState<LogListParams>({});

  const isSuperAdmin = access.canLogViewAdminAndIp;
  const canExport = access.canLogExport;

  useEffect(() => {
    if (!access.canAccessSystemLog) {
      history.replace('/403');
    }
  }, [access.canAccessSystemLog]);

  const currentUserRole = isSuperAdmin ? 'super_admin' : 'normal_admin';

  const fetchLogList = async (
    params: ParamsType & {
      current?: number;
      pageSize?: number;
      username?: string;
      operateType?: string;
      operateTime?: [string, string];
      ip?: string;
      result?: string;
    },
    _sort: Record<string, SortOrder>,
    _filter: Record<string, (string | number)[] | null>,
  ) => {
    try {
      const {
        current = 1,
        pageSize = 10,
        username,
        operateType,
        operateTime,
        ip,
        result,
      } = params as {
        current?: number;
        pageSize?: number;
        username?: string;
        operateType?: string;
        operateTime?: [string, string];
        ip?: string;
        result?: string;
      };

      let operateTimeRange: string[] = [];
      if (
        operateTime &&
        Array.isArray(operateTime) &&
        operateTime.length === 2 &&
        operateTime[0] &&
        operateTime[1]
      ) {
        operateTimeRange = [
          dayjs(operateTime[0]).format('YYYY-MM-DD HH:mm:ss'),
          dayjs(operateTime[1]).format('YYYY-MM-DD HH:mm:ss'),
        ];
      }

      const requestParams: LogListParams = {
        pageNum: current,
        pageSize,
        username: username ?? '',
        operateType: operateType ?? '',
        operateTime: operateTimeRange,
        ip: ip ?? '',
        result: result ?? '',
        logType: activeTab,
        currentUserRole,
      };

      setCurrentParams(requestParams);

      const response = await fetchLogListService(requestParams);

      if (response.code !== 200) {
        return toProTableFail<LogItem>();
      }
      const list = withIndex(response.data?.list ?? [], current, pageSize);
      return toProTableSuccess(list, response.data?.total ?? 0);
    } catch (error: unknown) {
      return toProTableFail<LogItem>();
    }
  };

  const handleExport = async () => {
    if (!canExport) {
      message.warning('无权限执行该操作');
      return;
    }
    try {
      const params = {
        ...currentParams,
        pageNum: 1,
        pageSize: 10000,
      };
      const response = await exportLog(params);
      if (response.code === 200) {
        message.success(response.message || '导出成功');
        if (
          (response as { data?: { downloadUrl?: string } })?.data?.downloadUrl
        ) {
          window.open(
            (response as { data: { downloadUrl: string } }).data.downloadUrl,
            '_blank',
          );
        }
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
    }
  };

  const baseColumns: ProColumns<LogItem>[] = [
    {
      title: '序号',
      dataIndex: '_index',
      key: '_index',
      width: 80,
      align: 'center',
      hideInSearch: true,
    },
    {
      title: '操作人',
      dataIndex: 'username',
      key: 'username',
      align: 'center',
      fieldProps: {
        placeholder: '请输入操作人',
        onPressEnter: () => actionRef.current?.reload(),
      },
    },
    {
      title: '操作类型',
      dataIndex: 'operateType',
      key: 'operateType',
      align: 'center',
      valueType: 'select',
      valueEnum: {
        登录: { text: '登录' },
        用户管理: { text: '用户管理' },
        审计日志: { text: '审计日志' },
        数据查询: { text: '数据查询' },
        数据上传: { text: '数据上传' },
        任务创建: { text: '任务创建' },
        系统配置: { text: '系统配置' },
      },
      fieldProps: { placeholder: '请选择操作类型' },
    },
    {
      title: '操作时间',
      dataIndex: 'operateTime',
      key: 'operateTime',
      align: 'center',
      valueType: 'dateTimeRange',
      search: {
        transform: (value: [string, string]) => ({ operateTime: value }),
      },
    },
    ...(isSuperAdmin
      ? [
          {
            title: 'IP地址',
            dataIndex: 'ip',
            key: 'ip',
            align: 'center' as const,
            fieldProps: {
              placeholder: '请输入IP地址',
              onPressEnter: () => actionRef.current?.reload(),
            },
          } as ProColumns<LogItem>,
        ]
      : []),
    {
      title: '操作内容',
      dataIndex: 'content',
      key: 'content',
      align: 'center',
      ellipsis: true,
      hideInSearch: true,
    },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      align: 'center',
      valueType: 'select',
      valueEnum: {
        success: { text: '成功', status: 'Success' },
        failed: { text: '失败', status: 'Error' },
      },
      fieldProps: { placeholder: '请选择结果' },
    },
  ];

  return (
    <PageContainer
      title="日志管理"
      subTitle="查看系统日志与操作日志，支持筛选查询与导出。"
      extra={
        canExport
          ? [
              <Button key="export" onClick={handleExport}>
                导出Excel
              </Button>,
            ]
          : undefined
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={(k) => {
          setActiveTab(k as LogTypeTab);
          setTimeout(() => actionRef.current?.reload(), 0);
        }}
        items={[
          { key: 'operation', label: '操作日志' },
          { key: 'system', label: '系统日志' },
        ]}
      />
      <ProTable<LogItem>
        actionRef={actionRef}
        columns={baseColumns}
        request={fetchLogList}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
        }}
        toolBarRender={false}
        dateFormatter="string"
      />
    </PageContainer>
  );
};

export default LogManagement;
