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
export default {
  /** 本地开发环境：api 与 mlflow 代理 */
  dev: {
    /** 平台后端（backend-api.md：默认 8080） */
    '/api/': {
      target: process.env.DEV_API_TARGET || 'http://47.114.84.133:8080',
      changeOrigin: true,
    },
    /** 独立 MLflow 服务，用于任务详情页训练指标 */
    '/mlflow-api/': {
      target: process.env.DEV_MLFLOW_TARGET || 'http://47.114.84.133:5000',
      changeOrigin: true,
      pathRewrite: { '^/mlflow-api': '/ajax-api' },
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
};
