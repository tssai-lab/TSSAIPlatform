import { ReloadOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import React from 'react';

type WorkspaceHeaderProps = {
  onReset: () => void;
};

const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({ onReset }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      flexWrap: 'wrap',
      gap: 12,
      paddingBottom: 8,
      borderBottom: '1px solid #f0f0f0',
    }}
  >
    <Typography.Text strong>推理工作区</Typography.Text>
    <Button icon={<ReloadOutlined />} onClick={onReset}>
      重置输入
    </Button>
  </div>
);

export default WorkspaceHeader;
