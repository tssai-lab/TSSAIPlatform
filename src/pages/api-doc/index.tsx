import 'swagger-ui-react/swagger-ui.css';

import { PageContainer } from '@ant-design/pro-components';
import React from 'react';
import SwaggerUI from 'swagger-ui-react';
import { STORAGE_KEYS, storage } from '@/utils/storage';

const ApiDoc: React.FC = () => {
  return (
    <PageContainer ghost title="OpenAPI 文档" style={{ maxWidth: 'none' }}>
      <SwaggerUI
        url="/v3/api-docs"
        docExpansion="list"
        defaultModelsExpandDepth={-1}
        requestInterceptor={(req) => {
          const token = storage.get<string>(STORAGE_KEYS.TOKEN);
          if (token && req.headers) {
            req.headers.Authorization = `Bearer ${token}`;
          }
          return req;
        }}
      />
    </PageContainer>
  );
};

export default ApiDoc;
