import { Spin } from 'antd';
import React, { useEffect, useRef } from 'react';

export interface ChartPanelProps {
  metricsData?: any;
  loading?: boolean;
}

/**
 * ChartPanel 组件
 * 功能：渲染训练指标折线图，支持切换指标、显示图例、下载图片
 */
const ChartPanel: React.FC<ChartPanelProps> = ({
  metricsData,
  loading = false,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // TODO: 集成 ECharts
    // 1. 安装 echarts: npm install echarts
    // 2. 初始化图表
    // 3. 渲染训练指标数据
    if (chartRef.current && metricsData) {
      console.log('渲染图表数据:', metricsData);
      // const chart = echarts.init(chartRef.current);
      // chart.setOption({...});
    }
  }, [metricsData]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div
        ref={chartRef}
        style={{
          width: '100%',
          height: 400,
          border: '1px solid #e8e8e8',
          borderRadius: 4,
        }}
      >
        {/* TODO: ECharts 图表将在这里渲染 */}
        <div style={{ textAlign: 'center', paddingTop: 180, color: '#999' }}>
          图表区域（待集成 ECharts）
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <button type="button">下载图片</button>
        <span style={{ marginLeft: 16, fontSize: 12, color: '#999' }}>
          提示：需要安装 echarts 并实现图表渲染逻辑
        </span>
      </div>
    </div>
  );
};

export default ChartPanel;
