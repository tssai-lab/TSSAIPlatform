const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const app = express();
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8000);
const distDir = path.join(__dirname, '..', 'dist');
const indexFile = path.join(distDir, 'index.html');

const backendTarget = process.env.BACKEND_PROXY_TARGET || 'http://127.0.0.1:8080';
const mlflowTarget = process.env.MLFLOW_PROXY_TARGET || 'http://127.0.0.1:5000';

function createProxyMiddleware(target, options = {}) {
  const targetUrl = new URL(target);
  const client = targetUrl.protocol === 'https:' ? https : http;
  const {
    prefix = '',
    rewritePrefix = '',
  } = options;

  return (req, res) => {
    const originalPath = req.originalUrl || req.url;
    const proxiedPath = prefix && rewritePrefix !== undefined
      ? originalPath.replace(prefix, rewritePrefix)
      : originalPath;

    const proxyReq = client.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        method: req.method,
        path: proxiedPath,
        headers: {
          ...req.headers,
          host: targetUrl.host,
        },
      },
      (proxyRes) => {
        res.status(proxyRes.statusCode || 500);
        Object.entries(proxyRes.headers).forEach(([key, value]) => {
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        });
        proxyRes.pipe(res);
      },
    );

    proxyReq.on('error', (error) => {
      res.status(502).json({
        code: 502,
        success: false,
        message: `Proxy request failed: ${error.message}`,
      });
    });

    req.pipe(proxyReq);
  };
}

app.use(
  '/api',
  createProxyMiddleware(backendTarget),
);

app.use(
  '/mlflow-api',
  createProxyMiddleware(mlflowTarget, {
    prefix: '/mlflow-api',
    rewritePrefix: '/ajax-api',
  }),
);

app.use(express.static(distDir, { extensions: ['html'] }));

app.get('*', (_req, res) => {
  res.sendFile(indexFile);
});

app.listen(port, host, () => {
  console.log(`Frontend is available at http://${host}:${port}`);
  console.log(`Proxy /api -> ${backendTarget}`);
  console.log(`Proxy /mlflow-api -> ${mlflowTarget}/ajax-api`);
});
