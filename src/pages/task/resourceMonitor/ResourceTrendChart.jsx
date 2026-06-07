import { Line } from '@ant-design/plots';
import React, { useMemo } from 'react';

/** Grafana / 监控面板常用配色 */
export const SERIES_COLOR_MAP = {
  CPU: '#5794F2',
  内存: '#73BF69',
  GPU: '#B877D9',
};

const SERIES_ORDER = ['CPU', '内存', 'GPU'];

/** 各粒度 X 轴左侧最大值（右侧固定为 0，表示距当前的时间单位数） */
const INTERVAL_MAX_OFFSET = {
  '1min': 60,
  '10min': 12,
  '1hour': 24,
  '1day': 30,
};

/**
 * 将数据映射为相对偏移量
 * 左侧 = maxOffset（最早），右侧 = 0（当前）
 */
const transformChartData = (data = [], interval = '1hour') => {
  const maxOffset = INTERVAL_MAX_OFFSET[interval] ?? 24;
  const maxTickIndex = Math.max(...data.map((d) => d.tickIndex ?? 0), 1);

  return data.map((d) => ({
    ...d,
    offset: +(((d.tickIndex ?? 0) * maxOffset) / maxTickIndex).toFixed(2),
  }));
};

/** 生成 X 轴刻度（右 0 → 左 max，中间均分） */
const buildXTicks = (maxOffset) => {
  const count = 5;
  return Array.from({ length: count }, (_, i) =>
    Math.round((maxOffset * i) / (count - 1)),
  );
};

const getAxisConfig = (maxOffset) => {
  const ticks = buildXTicks(maxOffset);

  return {
    x: {
      position: 'bottom',
      title: false,
      line: true,
      lineStroke: '#e5e6eb',
      tick: true,
      tickStroke: '#e5e6eb',
      tickLength: 4,
      size: 36,
      label: true,
      labelFontSize: 12,
      labelFill: '#595959',
      labelAlign: 'horizontal',
      labelAutoRotate: false,
      labelFormatter: (v) => String(Math.round(Number(v))),
      tickFilter: (v) => ticks.includes(Math.round(Number(v))),
      labelFilter: (v) => ticks.includes(Math.round(Number(v))),
    },
    y: {
      position: 'left',
      title: false,
      label: true,
      labelFontSize: 12,
      labelFill: '#595959',
      labelFormatter: (v) => `${v}%`,
      grid: true,
      gridStroke: '#f0f0f0',
      gridLineDash: [4, 4],
      line: false,
      tick: false,
    },
  };
};

export const getResourceTrendChartConfig = (data = [], options = {}) => {
  const { height = 380, interval = '1hour' } = options;
  const maxOffset = INTERVAL_MAX_OFFSET[interval] ?? 24;
  const chartData = transformChartData(data, interval);

  return {
    data: chartData,
    xField: 'offset',
    yField: 'value',
    colorField: 'type',
    height,
    autoFit: true,
    padding: [40, 32, 48, 56],
    style: { lineWidth: 2 },
    area: { style: { fillOpacity: 0.08 } },
    scale: {
      x: {
        type: 'linear',
        domain: [0, maxOffset],
        range: [1, 0],
        tickMethod: () => buildXTicks(maxOffset),
      },
      y: { domain: [0, 100], nice: true },
      color: {
        domain: SERIES_ORDER,
        range: SERIES_ORDER.map((key) => SERIES_COLOR_MAP[key]),
      },
    },
    axis: getAxisConfig(maxOffset),
    legend: {
      color: {
        position: 'top',
        layout: { justifyContent: 'center' },
        itemMarker: 'hyphen',
        itemSpacing: 24,
      },
    },
    interaction: {
      tooltip: {
        shared: true,
        crosshairs: true,
        crosshairsStroke: '#8c8c8c',
        crosshairsLineDash: [4, 4],
      },
    },
    tooltip: {
      title: 'fullTime',
      items: [
        {
          channel: 'y',
          name: 'type',
          valueFormatter: (v) => `${v}%`,
        },
      ],
    },
    animation: {
      appear: { animation: 'path-in', duration: 800 },
    },
  };
};

const ResourceTrendChart = ({
  data = [],
  height = 380,
  interval = '1hour',
}) => {
  const safeData = Array.isArray(data) ? data : [];

  const config = useMemo(
    () => getResourceTrendChartConfig(safeData, { height, interval }),
    [safeData, height, interval],
  );

  if (!safeData.length) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
        }}
      >
        暂无趋势数据
      </div>
    );
  }

  return <Line {...config} />;
};

export default ResourceTrendChart;
