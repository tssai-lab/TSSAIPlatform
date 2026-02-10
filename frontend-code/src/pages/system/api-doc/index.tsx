import { PageContainer } from '@ant-design/pro-components';
import React from 'react';

/**
 * API 文档页
 */
const ApiDoc: React.FC = () => {
  return (
    <PageContainer title="API 文档">
      <iframe
        src="/doc.html"
        style={{
          width: '100%',
          height: 'calc(100vh - 200px)',
          border: 'none',
        }}
        title="API文档"
      />
    </PageContainer>
  );
};

export default ApiDoc;






