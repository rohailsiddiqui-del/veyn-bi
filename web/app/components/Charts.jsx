'use client';
import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import dynamic from 'next/dynamic';
Chart.register(...registerables);

// ── ApexCharts (SSR-safe dynamic import) ─────────────────────────────────────
const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

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

// ── ApexCharts: Radial Gauge ──────────────────────────────────────────────────
export function RadialGauge({ value = 0, label = '', color, size = 200 }) {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  const fillColor = color ?? (pct >= 65 ? '#22C55E' : pct >= 45 ? '#F59E0B' : '#EF4444');

  const options = {
    chart: { type: 'radialBar', background: 'transparent', animations: { enabled: true, speed: 800 } },
    plotOptions: {
      radialBar: {
        startAngle: -135, endAngle: 135,
        hollow: { size: '58%', background: 'transparent' },
        track: { background: '#1F2937', strokeWidth: '100%' },
        dataLabels: {
          name: { show: true, offsetY: 22, fontSize: '11px', color: '#6B7280', fontWeight: 600 },
          value: { show: true, offsetY: -8, fontSize: '24px', fontWeight: 700, color: '#F9FAFB',
            formatter: (v) => `${Math.round(v)}%` },
        },
      },
    },
    fill: { colors: [fillColor] },
    stroke: { lineCap: 'round' },
    labels: [label],
    theme: { mode: 'dark' },
  };

  return (
    <div style={{ width: size, height: size, margin: '0 auto' }}>
      <ApexChart type="radialBar" series={[pct]} options={options} height={size} width={size} />
    </div>
  );
}

// ── ApexCharts: Sparkline ─────────────────────────────────────────────────────
export function Sparkline({ data = [], color = '#8B5CF6', height = 50 }) {
  if (!data || data.length < 2) return null;
  const options = {
    chart: { type: 'area', sparkline: { enabled: true }, animations: { enabled: true, speed: 600 }, background: 'transparent' },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
    colors: [color],
    tooltip: { fixed: { enabled: false }, x: { show: false }, marker: { show: false }, theme: 'dark' },
    theme: { mode: 'dark' },
  };
  return (
    <ApexChart type="area" series={[{ data }]} options={options} height={height} width="100%" />
  );
}

// ── ApexCharts: Multi-Line Area Chart ─────────────────────────────────────────
// series: [{ name, data: number[], color }], labels: string[]
export function MultiAreaChart({ series = [], labels = [], height = 300 }) {
  const options = {
    chart: { type: 'area', background: 'transparent', toolbar: { show: false },
      animations: { enabled: true, speed: 700 }, zoom: { enabled: false } },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2.5 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.03, stops: [0, 100] } },
    colors: series.map((s) => s.color ?? '#8B5CF6'),
    xaxis: {
      categories: labels,
      labels: { style: { colors: '#6B7280', fontSize: '11px' }, rotate: -30 },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: '#6B7280', fontSize: '11px' }, formatter: (v) => `${Math.round(v)}` } },
    grid: { borderColor: 'rgba(55,65,81,0.5)', strokeDashArray: 3 },
    legend: { position: 'top', labels: { colors: '#9CA3AF' }, fontSize: '12px' },
    tooltip: { theme: 'dark', shared: true, intersect: false },
    theme: { mode: 'dark' },
  };
  return (
    <ApexChart type="area" series={series.map(({ name, data }) => ({ name, data }))}
      options={options} height={height} width="100%" />
  );
}

// ── ApexCharts: Ranked Horizontal Bar (for Top Complaints / lists) ────────────
// items: [{ label, value }], color: hex or array, seriesName: tooltip label
export function RankedBarChart({ items = [], color = '#8B5CF6', height, valueFormatter, seriesName = 'Count' }) {
  const labels = items.map((i) => i.label);
  const values = items.map((i) => Number(i.value));
  const dynamicHeight = height ?? Math.max(200, items.length * 44 + 60);

  const options = {
    chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, animations: { enabled: true, speed: 600 } },
    plotOptions: {
      bar: { horizontal: true, borderRadius: 5, distributed: Array.isArray(color),
        dataLabels: { position: 'top' }, barHeight: '55%' },
    },
    colors: Array.isArray(color) ? color : [color],
    dataLabels: {
      enabled: true, offsetX: 8,
      style: { fontSize: '11px', colors: ['#9CA3AF'] },
      formatter: valueFormatter ?? ((v) => v.toLocaleString()),
    },
    xaxis: {
      categories: labels,
      labels: { style: { colors: '#6B7280', fontSize: '11px' }, formatter: (v) => Number(v).toLocaleString() },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: '#9CA3AF', fontSize: '11px' }, maxWidth: 220 } },
    grid: { borderColor: 'rgba(55,65,81,0.3)', strokeDashArray: 3,
      xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
    tooltip: {
      theme: 'dark', shared: false, intersect: true,
      y: { formatter: (v) => `${Number(v).toLocaleString()} ${seriesName.toLowerCase()}` },
    },
    theme: { mode: 'dark' },
  };

  return (
    <ApexChart type="bar" series={[{ name: seriesName, data: values }]}
      options={options} height={dynamicHeight} width="100%" />
  );
}
