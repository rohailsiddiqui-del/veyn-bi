'use client';
import { cn } from '@/app/lib/utils';

export function KpiCard({ label, value, sub, accent = 'purple', className }) {
  const accentMap = {
    purple: 'border-l-primary',
    green: 'border-l-success',
    red: 'border-l-danger',
    amber: 'border-l-warning',
    blue: 'border-l-info',
  };
  const valColorMap = {
    purple: 'text-primary-soft',
    green: 'text-success',
    red: 'text-danger',
    amber: 'text-warning',
    blue: 'text-info',
  };

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-xl p-5 border-l-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20 hover:border-border2',
        accentMap[accent],
        className
      )}
    >
      <div className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">{label}</div>
      <div className={cn('text-3xl font-bold leading-none', valColorMap[accent])}>{value}</div>
      {sub && <div className="text-xs text-text-muted mt-2">{sub}</div>}
    </div>
  );
}

export function CardPanel({ title, sub, children, className, action }) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-xl p-5 transition-all duration-300 hover:border-border2',
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-start justify-between mb-4">
          <div>
            {title && (
              <div className="text-xs font-semibold text-text-label uppercase tracking-widest">{title}</div>
            )}
            {sub && (
              <div className="text-[11px] text-text-muted mt-0.5 normal-case tracking-normal font-normal">{sub}</div>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Badge({ children, variant = 'default', className }) {
  const variants = {
    default: 'bg-border text-text-label',
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
    purple: 'bg-primary/10 text-primary-soft border border-primary/20',
  };
  return (
    <span className={cn('badge', variants[variant], className)}>{children}</span>
  );
}

export function Button({ children, variant = 'primary', className, ...props }) {
  const variants = {
    primary: 'btn-primary',
    outline: 'btn-outline',
    ghost: 'bg-transparent border border-border2 text-text-label rounded-lg py-2 px-4 text-xs font-semibold cursor-pointer transition-all duration-200 hover:border-danger hover:text-danger',
    danger: 'bg-danger text-white border-none rounded-lg py-2 px-4 text-sm font-semibold cursor-pointer transition-all duration-200 hover:bg-danger/90',
  };
  return (
    <button className={cn(variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-text-muted text-sm">
      <svg className="animate-spin w-5 h-5 mr-2 text-primary" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Loading...
    </div>
  );
}

export function EmptyState({ message }) {
  return (
    <div className="text-center py-12 text-text-muted text-sm">{message}</div>
  );
}

export function Select({ className, ...props }) {
  return (
    <select
      className={cn(
        'bg-surface border border-border2 rounded-lg text-text-main py-2 px-3 text-sm outline-none cursor-pointer transition-colors hover:border-primary focus:border-primary',
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn('input-field', className)}
      {...props}
    />
  );
}
