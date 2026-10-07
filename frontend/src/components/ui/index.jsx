// SafaKabad UI kit. Small, accessible building blocks shared by every page.
import { forwardRef, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import { STATUS_LABEL, STATUS_TONE } from '../../utils/format';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

// ---------- Buttons ----------
const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};
const SIZES = { sm: '!px-3 !py-1.5 text-sm', md: 'text-sm', lg: '!px-6 !py-3 text-base' };

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, children, className, to, href, ...rest },
  ref
) {
  const cls = cx(VARIANTS[variant], SIZES[size], className);
  const content = (
    <>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : Icon ? <Icon className="w-4 h-4" aria-hidden /> : null}
      {children}
    </>
  );
  if (to) return <Link ref={ref} to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a ref={ref} href={href} className={cls} {...rest}>{content}</a>;
  return (
    <button ref={ref} type={rest.type || 'button'} className={cls} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

export function IconButton({ label, icon: Icon, className, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('w-9 h-9 inline-flex items-center justify-center rounded-lg text-steel-600 hover:bg-steel-100 hover:text-steel-900 transition-colors', className)} {...rest}>
      <Icon className="w-[18px] h-[18px]" aria-hidden />
    </button>
  );
}

// ---------- Form fields ----------
export function Field({ label, error, hint, children, required, className }) {
  const id = useId();
  const child = typeof children === 'function' ? children(id) : children;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="text-rust-600 ml-0.5" aria-hidden>*</span>}
        </label>
      )}
      {child}
      {error ? (
        <p className="text-danger-600 text-xs mt-1.5" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-steel-500 text-xs mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={cx('input', invalid && '!border-danger-600', className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Select = forwardRef(function Select({ className, children, invalid, ...rest }, ref) {
  return (
    <select ref={ref} className={cx('input pr-8', invalid && '!border-danger-600', className)} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} className={cx('input min-h-[88px]', invalid && '!border-danger-600', className)} aria-invalid={invalid || undefined} {...rest} />;
});

export function Toggle({ checked, onChange, label, disabled, description }) {
  return (
    <label className={cx('flex items-start gap-3 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-patina-600' : 'bg-steel-300')}
      >
        <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
      {(label || description) && (
        <span>
          {label && <span className="text-sm font-medium text-steel-900 block">{label}</span>}
          {description && <span className="text-xs text-steel-500 block">{description}</span>}
        </span>
      )}
    </label>
  );
}

// ---------- Surfaces ----------
export function Card({ className, children, padded = true, as: As = 'div', ...rest }) {
  return (
    <As className={cx('bg-surface border border-steel-100 rounded-xl shadow-card', padded && 'p-5', className)} {...rest}>
      {children}
    </As>
  );
}

export function SectionTitle({ title, subtitle, action, className }) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-3 mb-4', className)}>
      <div>
        <h2 className="font-head text-lg font-semibold text-steel-900">{title}</h2>
        {subtitle && <p className="text-sm text-steel-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="inline-flex items-center gap-1 text-sm text-steel-500 hover:text-steel-900 mb-1">
            <ChevronLeft className="w-4 h-4" aria-hidden /> {back.label}
          </Link>
        )}
        <h1 className="font-head text-2xl sm:text-[1.7rem] font-semibold text-steel-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-steel-500 mt-1 text-sm sm:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Badges ----------
const TONES = {
  steel: 'bg-steel-100 text-steel-700',
  rust: 'bg-rust-100 text-rust-700',
  patina: 'bg-patina-100 text-patina-700',
  amber: 'bg-amber-100 text-amber-700',
  danger: 'bg-danger-100 text-danger-700',
  blue: 'bg-[rgb(var(--viz-2)/0.14)] text-[rgb(var(--viz-2))]',
};
export function Badge({ tone = 'steel', children, className, dot }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap', TONES[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  return (
    <Badge tone={STATUS_TONE[status] || 'steel'} dot>
      {STATUS_LABEL[status] || status}
    </Badge>
  );
}

// ---------- Loading / empty / error ----------
export function Skeleton({ className }) {
  return <div className={cx('relative overflow-hidden rounded-lg bg-steel-100', className)} aria-hidden>
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent" />
  </div>;
}

export function SkeletonRows({ rows = 4, className }) {
  return (
    <div className={cx('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }) {
  return (
    <span role="status" className={cx('inline-flex items-center gap-2 text-steel-500 text-sm', className)}>
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> {label}
    </span>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cx('text-center py-12 px-6 rounded-xl border border-dashed border-steel-200 bg-surface', className)}>
      <div className="w-12 h-12 mx-auto rounded-full bg-steel-100 text-steel-500 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" aria-hidden />
      </div>
      <p className="font-medium text-steel-900">{title}</p>
      {description && <p className="text-sm text-steel-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }) {
  return (
    <div role="alert" className={cx('rounded-xl border border-danger-100 bg-danger-50 p-5 flex items-start gap-3', className)}>
      <AlertTriangle className="w-5 h-5 text-danger-600 shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1">
        <p className="font-medium text-danger-700">Couldn't load this</p>
        <p className="text-sm text-steel-600 mt-0.5">{error?.message || 'Please check your connection and try again.'}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ---------- Stat tile ----------
export function Stat({ label, value, hint, icon: Icon, tone = 'steel', className }) {
  const iconTone = { steel: 'bg-steel-100 text-steel-700', rust: 'bg-rust-100 text-rust-700', patina: 'bg-patina-100 text-patina-700', amber: 'bg-amber-100 text-amber-700' }[tone];
  return (
    <Card className={cx('flex items-start gap-4', className)}>
      {Icon && (
        <span className={cx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', iconTone)}>
          <Icon className="w-5 h-5" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <div className="text-sm text-steel-500">{label}</div>
        <div className="font-head text-2xl font-semibold text-steel-900 mt-0.5 tabular">{value}</div>
        {hint && <div className="text-xs text-steel-500 mt-1">{hint}</div>}
      </div>
    </Card>
  );
}

// ---------- Tabs ----------
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('flex gap-1 border-b border-steel-100 overflow-x-auto overflow-y-hidden -mx-1 px-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            'px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
            value === t.value ? 'border-rust-600 text-steel-900' : 'border-transparent text-steel-500 hover:text-steel-900'
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 text-xs text-steel-400 tabular">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, className, size = 'md' }) {
  return (
    <div className={cx('inline-flex p-1 rounded-lg bg-steel-100', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md font-medium transition-colors inline-flex items-center gap-1.5',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.value ? 'bg-surface text-steel-900 shadow-card' : 'text-steel-600 hover:text-steel-900'
          )}
        >
          {o.icon && <o.icon className="w-4 h-4" aria-hidden />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Pagination ----------
export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null;
  const { page, pages, total, limit } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <nav className="flex items-center justify-between gap-3 mt-4 text-sm" aria-label="Pagination">
      <span className="text-steel-500 tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-1">
        <IconButton label="Previous page" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} className="disabled:opacity-40" />
        <span className="px-2 py-2 text-steel-700 tabular">
          {page} / {pages}
        </span>
        <IconButton label="Next page" icon={ChevronRight} disabled={page >= pages} onClick={() => onPage(page + 1)} className="disabled:opacity-40" />
      </div>
    </nav>
  );
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const lastFocus = useRef(null);
  // Keep the latest onClose without re-running the focus trap on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    lastFocus.current = document.activeElement;
    const el = ref.current;
    el?.querySelector('input,select,textarea,button:not([data-close])')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && el) {
        const f = el.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      lastFocus.current?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('relative w-full bg-surface rounded-t-2xl sm:rounded-2xl shadow-lift max-h-[92dvh] flex flex-col animate-fade-up', width)}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-steel-100">
          <h2 className="font-head font-semibold text-lg text-steel-900">{title}</h2>
          <IconButton label="Close" icon={X} onClick={onClose} data-close />
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-steel-100 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ---------- Data table ----------
// columns: [{ key, header, render?, className?, sortable? }]
export function DataTable({ columns, rows, rowKey = '_id', loading, empty, selectable, selected = [], onSelect, onRowClick, sort, onSort, dense }) {
  const allSelected = rows?.length > 0 && rows.every((r) => selected.includes(r[rowKey]));
  if (loading && !rows) return <SkeletonRows rows={6} />;
  if (rows && !rows.length) return empty || <EmptyState title="Nothing here yet" />;
  return (
    <div className={cx('relative bg-surface border border-steel-100 rounded-xl shadow-card overflow-x-auto transition-opacity', loading && 'opacity-60')}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-steel-500 border-b border-steel-100 bg-surface-2">
            {selectable && (
              <th className="w-10 pl-4">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  className="accent-rust-600"
                  checked={allSelected}
                  onChange={() => onSelect(allSelected ? [] : rows.map((r) => r[rowKey]))}
                />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} className={cx('px-4 py-3 font-medium whitespace-nowrap', c.className)} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                {c.sortable && onSort ? (
                  <button type="button" className="hover:text-steel-900 inline-flex items-center gap-1" onClick={() => onSort(c.key)}>
                    {c.header}
                    {sort?.key === c.key && <span aria-hidden>{sort.dir === 1 ? '↑' : '↓'}</span>}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r[rowKey]}
              className={cx('border-b border-steel-100 last:border-0', onRowClick && 'cursor-pointer hover:bg-steel-50', selected.includes(r[rowKey]) && 'bg-rust-50')}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {selectable && (
                <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label="Select row"
                    className="accent-rust-600"
                    checked={selected.includes(r[rowKey])}
                    onChange={() => onSelect(selected.includes(r[rowKey]) ? selected.filter((x) => x !== r[rowKey]) : [...selected, r[rowKey]])}
                  />
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key} className={cx('px-4 align-middle', dense ? 'py-2' : 'py-3', c.className)}>
                  {c.render ? c.render(r) : r[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Avatar({ name = '', size = 'md' }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const s = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }[size];
  return (
    <span className={cx('rounded-full bg-rust-100 text-rust-700 font-semibold inline-flex items-center justify-center shrink-0', s)} aria-hidden>
      {initials || '?'}
    </span>
  );
}

export function Stars({ value = 0, size = 'w-4 h-4' }) {
  return (
    <span className="inline-flex text-amber-600" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className={cx(size, i <= Math.round(value) ? 'fill-current' : 'fill-steel-200')} aria-hidden>
          <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 15l-5.2 2.7 1-5.9L1.5 7.7l5.9-.8z" />
        </svg>
      ))}
    </span>
  );
}
