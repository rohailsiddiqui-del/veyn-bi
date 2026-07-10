import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function scoreColor(score) {
  if (score >= 90) return 'text-success';
  if (score >= 75) return 'text-warning';
  return 'text-danger';
}

export function scoreBg(score) {
  if (score >= 90) return 'badge-success';
  if (score >= 75) return 'badge-warning';
  return 'badge-danger';
}

export function sentimentColor(score) {
  const s = parseFloat(score) || 0;
  if (s > 0.2) return 'text-success';
  if (s < -0.2) return 'text-danger';
  return 'text-warning';
}

export function downloadCSV(rows, filename) {
  const csv = rows
    .map((r) =>
      r
        .map((v) => {
          if (v == null) return '';
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? '"' + s + '"' : s;
        })
        .join(',')
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
