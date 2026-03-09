import { PageContainer, ProCard } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import { message, Select, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useEffect, useState } from 'react';
import {
  getPermissionTree,
  getRolePermission,
} from '@/services/system/permission';
import { getRoleList } from '@/services/system/role';
import type { PermissionTreeNode, RoleItem } from '@/services/system/typings';

/**
 * 权限管理页（仅超级管理员可见）
 * 配置权限树（菜单+按钮+数据权限）、预览角色权限
 */
const PermissionManagement: React.FC = () => {
  const access = useAccess();
  const [treeData, setTreeData] = useState<PermissionTreeNode[]>([]);
  const [roleList, setRoleList] = useState<RoleItem[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | undefined>();
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!access.canAccessSystemPermission) {
      history.replace('/403');
    }
  }, [access.canAccessSystemPermission]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [treeRes, roleRes] = await Promise.all([
          getPermissionTree(),
          getRoleList({ pageNum: 1, pageSize: 100 }),
        ]);
        if (treeRes.code === 200) setTreeData(treeRes.data ?? []);
        if (roleRes.code === 200) setRoleList(roleRes.data?.list ?? []);
      } catch (e) {
        message.error((e as Error).message ?? '加载失败');
      } finally {
        setLoading(false);
      }
    };
    if (access.canAccessSystemPermission) load();
  }, [access.canAccessSystemPermission]);

  useEffect(() => {
    if (!selectedRoleId) {
      setCheckedKeys([]);
      return;
    }
    const load = async () => {
      try {
        const res = await getRolePermission(selectedRoleId);
        if (res.code === 200) setCheckedKeys(res.data ?? []);
      } catch {
        setCheckedKeys([]);
      }
    };
    load();
  }, [selectedRoleId]);

  if (!access.canAccessSystemPermission) return null;

  const buildTreeNodes = (nodes: PermissionTreeNode[]): DataNode[] =>
    nodes.map((n) => ({
      key: n.id,
      title: `${n.name}${n.type === 'menu' ? ' [菜单]' : n.type === 'button' ? ' [按钮]' : ' [数据]'}`,
      children:
        n.children && n.children.length > 0
          ? buildTreeNodes(n.children)
          : undefined,
    }));

  const treeNodes = buildTreeNodes(treeData);

  return (
    <PageContainer>
      <ProCard title="权限树配置" loading={loading}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ marginRight: 8 }}>预览角色权限：</span>
          <Select<number>
            placeholder="选择角色"
            style={{ width: 200 }}
            allowClear
            value={selectedRoleId ?? undefined}
            onChange={(v) => setSelectedRoleId(v ?? undefined)}
            options={roleList.map((r) => ({ label: r.name, value: r.id }))}
          />
        </div>
        {treeNodes.length > 0 && (
          <Tree
            checkable
            defaultExpandAll
            checkedKeys={checkedKeys}
            treeData={treeNodes}
            onCheck={(keys) => {
              const next =
                typeof keys === 'object' && keys && !Array.isArray(keys)
                  ? (keys as { checked: string[] }).checked
                  : (keys as string[]);
              setCheckedKeys(next ?? []);
            }}
          />
        )}
        <div style={{ marginTop: 16, color: '#999', fontSize: 12 }}>
          敏感操作（删除角色、修改核心权限）需二次确认。实际保存需对接后端接口。
        </div>
      </ProCard>
    </PageContainer>
  );
};

export default PermissionManagement;
