import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import api from '../services/api';
import { Skeleton, cx } from './ui';
import { useI18n } from '../i18n/I18nContext';

// Date strip (next N days, closed days greyed out) + slots with remaining capacity.
export default function SlotPicker({ pinCode, date, slot, onChange, excludePickupId }) {
  const { t } = useI18n();
  const [days, setDays] = useState(null);
  const [avail, setAvail] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    api
      .get('/public/slots/calendar', { params: { pin: pinCode } })
      .then((res) => {
        setDays(res.data.data.days);
        if (!date) {
          const first = res.data.data.days.find((d) => d.open);
          if (first) onChange({ date: first.date, slot: '' });
        }
      })
      .catch(() => setDays([]));
  }, [pinCode]);

  useEffect(() => {
    if (!date) return;
    setLoadingSlots(true);
    api
      .get('/public/slots', { params: { date, pin: pinCode, exclude: excludePickupId } })
      .then((res) => setAvail(res.data.data))
      .catch(() => setAvail(null))
      .finally(() => setLoadingSlots(false));
  }, [date, pinCode, excludePickupId]);

  if (!days) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x" role="radiogroup" aria-label="Pickup date">
        {days.map((d) => {
          const dt = new Date(`${d.date}T00:00:00`);
          const selected = d.date === date;
          return (
            <button
              key={d.date}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!d.open}
              title={d.reason || ''}
              onClick={() => onChange({ date: d.date, slot: '' })}
              className={cx(
                'snap-start shrink-0 w-[4.5rem] rounded-xl border px-2 py-2.5 text-center transition-colors',
                selected ? 'border-rust-600 bg-rust-50 ring-2 ring-rust-500/20' : 'border-steel-200 bg-surface hover:border-steel-400',
                !d.open && 'opacity-40 cursor-not-allowed hover:border-steel-200'
              )}
            >
              <div className="text-[11px] uppercase tracking-wide text-steel-500">{dt.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
              <div className="font-head text-xl font-semibold text-steel-900 leading-tight">{dt.getDate()}</div>
              <div className="text-[11px] text-steel-500">{dt.toLocaleDateString('en-GB', { month: 'short' })}</div>
            </button>
          );
        })}
      </div>

      <div>
        <div className="label">{t('book.selectSlot')}</div>
        {loadingSlots && !avail ? (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : avail && !avail.slots.length ? (
          <p className="text-sm text-steel-500">{avail.reason}</p>
        ) : (
          <div className={cx('grid grid-cols-1 sm:grid-cols-2 gap-2 transition-opacity', loadingSlots && 'opacity-60')} role="radiogroup" aria-label="Time slot">
            {avail?.slots.map((s) => {
              const selected = s.label === slot;
              return (
                <button
                  key={s.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!s.available}
                  onClick={() => onChange({ date, slot: s.label })}
                  className={cx(
                    'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                    selected ? 'border-rust-600 bg-rust-50 ring-2 ring-rust-500/20' : 'border-steel-200 bg-surface hover:border-steel-400',
                    !s.available && 'opacity-45 cursor-not-allowed hover:border-steel-200'
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-steel-900">
                    <Clock className="w-4 h-4 text-steel-500" aria-hidden /> {s.label}
                  </span>
                  <span className={cx('text-xs', s.available ? (s.remaining <= 2 ? 'text-amber-700' : 'text-steel-500') : 'text-steel-500')}>
                    {s.available ? t('book.slotsLeft', { n: s.remaining }) : s.reason}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
