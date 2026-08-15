/**
 * @name 代理的配置
 * @see 在生产环境 代理是无法生效的，所以这里没有生产环境的配置
 * -------------------------------
 * The agent cannot take effect in the production environment
 * so there is no configuration of the production environment
 * For details, please see
 * https://pro.ant.design/docs/deploy
 *
 * @doc https://umijs.org/docs/guides/proxy
 */

type ServerPreset = {
  api: string;
  mlflow: string;
  /** Main 的公网网关会负责把 /mlflow-api 改写为 /ajax-api。 */
  mlflowThroughGateway?: boolean;
};

/** 测试环境以 Main 为默认目标；DEV_SERVER=node 可显式切换旧节点。 */
const SERVERS: Record<string, ServerPreset> = {
  node: {
    api: 'http://47.114.84.133:8080',
    mlflow: 'http://47.114.84.133:5000',
  },
  master: {
    // Main 的 8080/5000 仅本机监听；外部开发机必须走 Nginx 80 端口。
    api: 'http://47.111.225.144',
    mlflow: 'http://47.111.225.144',
    mlflowThroughGateway: true,
  },
};

const activeServer =
  SERVERS[process.env.DEV_SERVER || 'master'] || SERVERS.master;

const API_TARGET = process.env.DEV_API_TARGET || activeServer.api;
const MLFLOW_TARGET = process.env.DEV_MLFLOW_TARGET || activeServer.mlflow;
const MLFLOW_PROXY = {
  target: MLFLOW_TARGET,
  changeOrigin: true,
  // 显式覆盖目标视为直连 MLflow；Main 网关则保留 /mlflow-api 交给 Nginx 改写。
  ...(!activeServer.mlflowThroughGateway || process.env.DEV_MLFLOW_TARGET
    ? { pathRewrite: { '^/mlflow-api': '/ajax-api' } }
    : {}),
};

export default {
  /** 本地开发环境：api 与 mlflow 代理 */
  dev: {
    /** 平台后端（backend-api.md：默认 8080） */
    '/api/': {
      target: API_TARGET,
      changeOrigin: true,
    },
    /** 独立 MLflow 服务，用于任务详情页训练指标 */
    '/mlflow-api/': MLFLOW_PROXY,
    /** openAPI服务*/
    '/v3/api-docs': {
      target: API_TARGET,
      changeOrigin: true,
    },
  },
  /**
   * @name 详细的代理配置
   * @doc https://github.com/chimurai/http-proxy-middleware
   */
  test: {
    // localhost:8000/api/** -> https://preview.pro.ant.design/api/**
    '/api/': {
      target: 'https://proapi.azurewebsites.net',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    },
  },
  pre: {
    '/api/': {
      target: 'your pre url',
      changeOrigin: true,
      pathRewrite: { '^': '' },
    },
  },
  /**
   * 本地以 prod 环境启动 dev / preview 时仍需代理到模块二（与 dev 相同目标）
   */
  prod: {
    '/api/': {
      target: API_TARGET,
      changeOrigin: true,
    },
    '/mlflow-api/': MLFLOW_PROXY,
    '/v3/api-docs': {
      target: API_TARGET,
      changeOrigin: true,
    },
  },
};
