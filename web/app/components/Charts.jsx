'use client';
import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const GRID_COLOR = 'rgba(55,65,81,0.5)';
const TICK_COLOR = '#6B7280';

function buildChartConfig(type, labels, data, colors, legend, options, horizontal) {
  const isMulti = Array.isArray(colors);
  return {
    type,
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: isMulti
            ? colors
            : type === 'bar'
            ? labels.map(() => colors + 'CC')
            : colors,
          borderColor: isMulti ? colors : colors,
          borderWidth: type === 'bar' ? 0 : 2,
          borderRadius: type === 'bar' ? 6 : 0,
          fill: false,
          tension: 0.4,
          pointBackgroundColor: isMulti ? colors : colors,
          pointRadius: type === 'line' ? 4 : 0,
          hoverOffset: type === 'doughnut' ? 8 : 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      indexAxis: horizontal ? 'y' : 'x',
      plugins: {
        legend: {
          display: !!legend,
          labels: { color: TICK_COLOR, font: { size: 12 }, padding: 16 },
        },
        tooltip: {
          backgroundColor: '#1F2937',
          titleColor: '#F9FAFB',
          bodyColor: '#D1D5DB',
          borderColor: '#374151',
          borderWidth: 1,
        },
      },
      scales:
        type !== 'doughnut'
          ? {
              x: {
                ticks: { color: TICK_COLOR, font: { size: 11 } },
                grid: { color: GRID_COLOR },
              },
              y: {
                ticks: { color: TICK_COLOR, font: { size: 11 } },
                grid: { color: GRID_COLOR },
                min: options?.min || 0,
              },
            }
          : {},
    },
  };
}

export function BarChart({ labels, data, colors = '#8B5CF6', legend = false, height = 220, options, horizontal = false }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, buildChartConfig('bar', labels, data, colors, legend, options, horizontal));
    return () => chartRef.current?.destroy();
  }, [labels, data, colors, legend, options, horizontal]);

  return (
    <div style={{ position: 'relative', height: height, width: '100%' }}>
      <canvas ref={ref} />
    </div>
  );
}

export function DoughnutChart({ labels, data, colors, height = 220 }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, buildChartConfig('doughnut', labels, data, colors, true, {}, false));
    return () => chartRef.current?.destroy();
  }, [labels, data, colors]);

  return (
    <div style={{ position: 'relative', height: height, width: '100%' }}>
      <canvas ref={ref} />
    </div>
  );
}

export function LineChart({ labels, data, height = 280, minY = 60 }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data,
            borderColor: '#A78BFA',
            backgroundColor: 'rgba(139,92,246,0.08)',
            borderWidth: 2,
            pointBackgroundColor: '#A78BFA',
            pointRadius: 4,
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1F2937',
            titleColor: '#F9FAFB',
            bodyColor: '#D1D5DB',
            borderColor: '#374151',
            borderWidth: 1,
          },
        },
        scales: {
          x: { ticks: { color: TICK_COLOR, font: { size: 11 } }, grid: { color: GRID_COLOR } },
          y: { ticks: { color: TICK_COLOR, font: { size: 11 } }, grid: { color: GRID_COLOR }, min: minY },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [labels, data, minY]);

  return (
    <div style={{ position: 'relative', height: height, width: '100%' }}>
      <canvas ref={ref} />
    </div>
  );
}
