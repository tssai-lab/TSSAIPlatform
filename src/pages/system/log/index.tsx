import type {
  ActionType,
  ParamsType,
  ProColumns,
} from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import { message } from 'antd';
import type { SortOrder } from 'antd/es/table/interface';
import dayjs from 'dayjs';
import React, { useEffect, useRef } from 'react';
import {
  getLogList,
  type LogItem,
  type LogListParams,
} from '@/services/system/log';

/**
 * 日志管理页（操作日志）
 * 超管：全部操作人（含管理员）、IP
 * 普管：仅普通用户操作日志、无 IP 列
 */
const LogManagement: React.FC = () => {
  const access = useAccess();
  const actionRef = useRef<ActionType>(null);

  const isSuperAdmin = access.canLogViewAdminAndIp;

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
        currentUserRole,
      };

      const response = await getLogList(requestParams);

      if (response.code === 200) {
        const list = (response.data?.list ?? []).map(
          (item: LogItem, index: number) => ({
            ...item,
            _index: (current! - 1) * pageSize! + index + 1,
          }),
        );
        return {
          data: list,
          success: true,
          total: response.data?.total ?? 0,
        };
      }
      message.error(response.msg ?? '查询失败');
      return { data: [], success: false, total: 0 };
    } catch (error: unknown) {
      const err = error as { message?: string };
      message.error(err?.message ?? '查询失败');
      return { data: [], success: false, total: 0 };
    }
  };

  const columns: ProColumns<LogItem>[] = [
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
    <PageContainer title="日志管理" subTitle="用户操作日志查询">
      <ProTable<LogItem>
        actionRef={actionRef}
        columns={columns}
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
