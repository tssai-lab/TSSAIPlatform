import type {
  ActionType,
  ParamsType,
  ProColumns,
} from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import type { SortOrder } from 'antd/es/table/interface';
import dayjs from 'dayjs';
import React, { useEffect, useRef } from 'react';
import {
  fetchLogList as fetchLogListService,
  type LogItem,
  type LogListParams,
} from '@/services/system';
import { toProTableFail, toProTableSuccess, withIndex } from '@/utils/proTable';

/**
 * 个人中心 - 我的操作记录
 * 所有登录用户可见，仅展示当前用户自己的操作日志；筛选：时间/操作类型/操作内容/结果，操作人固定为当前用户
 */
const MyOperationLogs: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const currentUser = initialState?.currentUser;
  const actionRef = useRef<ActionType>(null);

  useEffect(() => {
    if (!currentUser) {
      history.replace('/user/login');
    }
  }, [currentUser]);

  const currentUsername =
    currentUser?.userid ??
    (typeof currentUser?.name === 'string'
      ? currentUser.name.replace(/（.*$/, '').trim()
      : '');

  const fetchMyLogList = async (
    params: ParamsType & {
      current?: number;
      pageSize?: number;
      operateType?: string;
      operateTime?: [string, string];
      result?: string;
      content?: string;
    },
    _sort: Record<string, SortOrder>,
    _filter: Record<string, (string | number)[] | null>,
  ) => {
    if (!currentUsername) {
      return toProTableFail<LogItem>();
    }
    try {
      const {
        current = 1,
        pageSize = 10,
        operateType,
        operateTime,
        result,
        content,
      } = params as {
        current?: number;
        pageSize?: number;
        operateType?: string;
        operateTime?: [string, string];
        result?: string;
        content?: string;
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
        username: '',
        operateType: operateType ?? '',
        operateTime: operateTimeRange,
        result: result ?? '',
        logType: 'operation',
        currentUsername,
        content: content ?? '',
      };

      const response = await fetchLogListService(requestParams);

      if (response.code === 200) {
        const list = withIndex(response.data?.list ?? [], current, pageSize);
        return toProTableSuccess(list, response.data?.total ?? 0);
      }
      return toProTableFail<LogItem>();
    } catch {
      return toProTableFail<LogItem>();
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
      title: '操作类型',
      dataIndex: 'operateType',
      key: 'operateType',
      align: 'center',
      valueType: 'select',
      valueEnum: {
        登录: { text: '登录' },
        用户管理: { text: '用户管理' },
        数据查询: { text: '数据查询' },
        数据上传: { text: '数据上传' },
        任务创建: { text: '任务创建' },
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
    {
      title: '操作内容',
      dataIndex: 'content',
      key: 'content',
      align: 'center',
      ellipsis: true,
      hideInSearch: false,
      fieldProps: { placeholder: '操作内容关键词' },
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

  if (!currentUser) return null;

  return (
    <PageContainer
      title="我的操作记录"
      subTitle={`当前用户：${currentUser.name ?? currentUsername}`}
    >
      <ProTable<LogItem>
        actionRef={actionRef}
        columns={columns}
        request={fetchMyLogList}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
        toolBarRender={false}
        dateFormatter="string"
      />
    </PageContainer>
  );
};

export default MyOperationLogs;
