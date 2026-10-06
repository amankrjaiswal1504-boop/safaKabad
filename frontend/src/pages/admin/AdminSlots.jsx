import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarCheck, CalendarX, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import api from '../../services/api';
import useApi from '../../hooks/useApi';
import { fmtDay, todayISO } from '../../utils/format';
import { useConfig } from '../../context/ConfigContext';
import { Badge, Button, Card, Field, IconButton, Input, PageHeader, SectionTitle, Select, Spinner, cx } from '../../components/ui';
import { Async, Callout, NumberInput, isBlank, useAction } from './_catalog/shared';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LABEL_RE = /^\d{1,2}:\d{2}\s*[AP]M\s*-\s*\d{1,2}:\d{2}\s*[AP]M$/i;
const hourLabel = (h) => (h === 0 ? '12 midnight' : h === 12 ? '12 noon' : h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`);

function validate(v) {
  const e = { slots: [] };
  if (!v.slots.length) e.general = 'Add at least one time slot';
  const seen = new Set();
  v.slots.forEach((s, i) => {
    const se = {};
    const label = s.label.trim();
    if (label.length < 3) se.label = 'Required';
    else if (label.length > 40) se.label = 'Too long';
    else if (seen.has(label.toLowerCase())) se.label = 'Duplicate slot';
    seen.add(label.toLowerCase());
    if (isBlank(s.capacity) || !Number.isInteger(Number(s.capacity)) || s.capacity < 0) se.capacity = 'Whole number, 0+';
    if (Object.keys(se).length) e.slots[i] = se;
  });
  if (isBlank(v.sameDayCutoffHour)) e.sameDayCutoffHour = 'Choose an hour';
  if (isBlank(v.maxDaysAhead) || v.maxDaysAhead < 0 || v.maxDaysAhead > 90) e.maxDaysAhead = 'Between 0 and 90 days';
  if (isBlank(v.rescheduleCutoffHours) || v.rescheduleCutoffHours < 0 || v.rescheduleCutoffHours > 168) e.rescheduleCutoffHours = 'Between 0 and 168 hours';
  if (v.closedWeekdays.length === 7) e.closedWeekdays = 'At least one day must stay open';
  const has = e.general || e.slots.some(Boolean) || e.sameDayCutoffHour || e.maxDaysAhead || e.rescheduleCutoffHours || e.closedWeekdays;
  return has ? e : null;
}

export default function AdminSlots() {
  const res = useApi('/admin/settings');
  return (
    <div>
      <PageHeader
        title="Time slots"
        subtitle="Pickup windows, how many bookings each takes, and the days you don't operate."
        actions={
          <Button variant="outline" to="/admin/settings">
            Other settings
          </Button>
        }
      />
      <Async {...res} onRetry={res.reload} rows={6}>
        {(d) => <SlotsEditor initial={d.settings.slots} onSaved={(value) => res.setData((x) => ({ ...x, settings: { ...x.settings, slots: value } }))} />}
      </Async>
    </div>
  );
}

function normalize(s) {
  return {
    slots: (s.slots || []).map((x) => ({ label: x.label || '', capacity: x.capacity ?? 0 })),
    sameDayCutoffHour: s.sameDayCutoffHour ?? '',
    maxDaysAhead: s.maxDaysAhead ?? '',
    holidays: [...(s.holidays || [])].sort(),
    closedWeekdays: [...(s.closedWeekdays || [])].sort(),
    rescheduleCutoffHours: s.rescheduleCutoffHours ?? '',
  };
}

function SlotsEditor({ initial, onSaved }) {
  const [base, setBase] = useState(() => normalize(initial));
  const [v, setV] = useState(base);
  const [showErrors, setShowErrors] = useState(false);
  const [holiday, setHoliday] = useState('');
  const { busy, run } = useAction();
  const dirty = JSON.stringify(v) !== JSON.stringify(base);
  const errors = useMemo(() => validate(v), [v]);
  const e = showErrors ? errors || {} : {};
  const set = (k) => (val) => setV((x) => ({ ...x, [k]: val }));
  const today = todayISO();

  const setSlot = (i, k, val) => setV((x) => ({ ...x, slots: x.slots.map((s, j) => (j === i ? { ...s, [k]: val } : s)) }));
  const move = (i, d) =>
    setV((x) => {
      const slots = [...x.slots];
      [slots[i], slots[i + d]] = [slots[i + d], slots[i]];
      return { ...x, slots };
    });

  function addHoliday() {
    if (!holiday || v.holidays.includes(holiday)) return setHoliday('');
    set('holidays')([...v.holidays, holiday].sort());
    setHoliday('');
  }

  async function save() {
    setShowErrors(true);
    if (errors) return;
    const value = {
      ...v,
      slots: v.slots.map((s) => ({ label: s.label.trim(), capacity: Number(s.capacity) })),
      sameDayCutoffHour: Number(v.sameDayCutoffHour),
      maxDaysAhead: Number(v.maxDaysAhead),
      rescheduleCutoffHours: Number(v.rescheduleCutoffHours),
    };
    const r = await run('save', () => api.put('/admin/settings/slots', { value }), { success: 'Slot settings saved' });
    if (r.ok) {
      const saved = normalize(r.out.data.data.value || value);
      setBase(saved);
      setV(saved);
      setShowErrors(false);
      onSaved(saved);
    }
  }

  const renamed = base.slots.filter((b) => !v.slots.some((s) => s.label.trim() === b.label));

  return (
    <div className="grid xl:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="space-y-6">
        <Card>
          <SectionTitle
            title="Daily slots"
            subtitle={'Use the format "9:00 AM - 11:00 AM" so same-day cutoffs work.'}
            action={
              <Button variant="outline" size="sm" icon={Plus} onClick={() => set('slots')([...v.slots, { label: '', capacity: v.slots[v.slots.length - 1]?.capacity ?? base.slots[base.slots.length - 1]?.capacity ?? '' }])}>
                Add slot
              </Button>
            }
          />
          {e.general && <p className="text-sm text-danger-600 mb-3" role="alert">{e.general}</p>}
          <ol className="space-y-3">
            {v.slots.map((s, i) => {
              const se = e.slots?.[i] || {};
              const fmtWarn = s.label.trim().length >= 3 && !LABEL_RE.test(s.label.trim());
              return (
                <li key={i} className="flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-3 p-3 rounded-lg bg-surface-2 border border-steel-100">
                  <span className="w-6 h-9 flex items-center justify-center text-xs text-steel-400 tabular shrink-0">{i + 1}</span>
                  <Field
                    label="Window"
                    className="flex-1 min-w-[160px]"
                    error={se.label}
                    hint={fmtWarn ? 'Tip: write it like "2:00 PM - 4:00 PM"' : undefined}
                  >
                    {(id) => <Input id={id} value={s.label} onChange={(ev) => setSlot(i, 'label', ev.target.value)} placeholder="9:00 AM - 11:00 AM" invalid={!!se.label} maxLength={40} />}
                  </Field>
                  <Field label="Capacity" className="w-24" error={se.capacity}>
                    {(id) => <NumberInput id={id} min={0} step={1} value={s.capacity} onChange={(val) => setSlot(i, 'capacity', val)} invalid={!!se.capacity} />}
                  </Field>
                  <div className="flex gap-0.5 sm:pt-6 ml-auto">
                    <IconButton label="Move up" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30" />
                    <IconButton label="Move down" icon={ArrowDown} disabled={i === v.slots.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30" />
                    <IconButton
                      label={`Remove slot ${s.label || i + 1}`}
                      icon={Trash2}
                      onClick={() => set('slots')(v.slots.filter((_, j) => j !== i))}
                      className="hover:!text-danger-600"
                    />
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-steel-500 mt-3">Capacity is the number of pickups per slot per municipality. 0 closes the slot.</p>
          {renamed.length > 0 && (
            <Callout tone="amber" className="mt-3">
              Existing bookings in {renamed.map((r) => `"${r.label}"`).join(', ')} keep their old slot name. Reschedule them if the window has really changed.
            </Callout>
          )}
        </Card>

        <Card>
          <SectionTitle title="Booking rules" />
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Same-day cutoff" hint="Same-day bookings close at this hour" error={e.sameDayCutoffHour}>
              {(id) => (
                <Select id={id} value={v.sameDayCutoffHour} onChange={(ev) => set('sameDayCutoffHour')(Number(ev.target.value))}>
                  {v.sameDayCutoffHour === '' && <option value="">Choose…</option>}
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Book up to (days ahead)" error={e.maxDaysAhead}>
              {(id) => <NumberInput id={id} min={0} max={90} value={v.maxDaysAhead} onChange={set('maxDaysAhead')} invalid={!!e.maxDaysAhead} />}
            </Field>
            <Field label="Reschedule cutoff (hours)" error={e.rescheduleCutoffHours} hint="Before the slot starts">
              {(id) => <NumberInput id={id} min={0} max={168} value={v.rescheduleCutoffHours} onChange={set('rescheduleCutoffHours')} invalid={!!e.rescheduleCutoffHours} />}
            </Field>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Closed days" subtitle="No pickups on these weekdays or dates." />
          <fieldset>
            <legend className="label">Weekly off</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w, i) => {
                const closed = v.closedWeekdays.includes(i);
                return (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={closed}
                    onClick={() => set('closedWeekdays')(closed ? v.closedWeekdays.filter((d) => d !== i) : [...v.closedWeekdays, i].sort())}
                    className={cx(
                      'w-14 py-2 rounded-lg text-sm font-medium border transition-colors',
                      closed ? 'bg-danger-50 border-danger-600 text-danger-700' : 'bg-surface border-steel-200 text-steel-700 hover:border-steel-400'
                    )}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
            {e.closedWeekdays ? (
              <p className="text-danger-600 text-xs mt-1.5" role="alert">{e.closedWeekdays}</p>
            ) : (
              <p className="text-steel-500 text-xs mt-1.5">
                {v.closedWeekdays.length ? `Closed every ${v.closedWeekdays.map((d) => WEEKDAYS[d]).join(', ')}` : 'Open all week'}
              </p>
            )}
          </fieldset>

          <div className="mt-6">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Add a holiday" className="w-48">
                {(id) => <Input id={id} type="date" min={today} value={holiday} onChange={(ev) => setHoliday(ev.target.value)} />}
              </Field>
              <Button variant="outline" icon={Plus} onClick={addHoliday} disabled={!holiday}>
                Add
              </Button>
            </div>
            {v.holidays.length ? (
              <ul className="flex flex-wrap gap-2 mt-3">
                {v.holidays.map((h) => (
                  <li key={h} className={cx('inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full border text-sm', h < today ? 'border-steel-100 text-steel-400' : 'border-steel-200 text-steel-700')}>
                    <CalendarX className="w-3.5 h-3.5" aria-hidden />
                    {fmtDay(h)}
                    {h < today && <span className="text-xs">(past)</span>}
                    <button
                      type="button"
                      aria-label={`Remove holiday ${fmtDay(h)}`}
                      onClick={() => set('holidays')(v.holidays.filter((x) => x !== h))}
                      className="w-6 h-6 rounded-full inline-flex items-center justify-center hover:bg-steel-100 text-steel-500"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-steel-500 mt-3">No holidays added.</p>
            )}
          </div>
        </Card>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-steel-200 bg-surface px-4 py-3 shadow-lift">
          <p className="text-sm text-steel-600">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</p>
          <div className="flex gap-2">
            <Button variant="ghost" icon={RotateCcw} disabled={!dirty || busy === 'save'} onClick={() => { setV(base); setShowErrors(false); }}>
              Reset
            </Button>
            <Button icon={Save} onClick={save} loading={busy === 'save'} disabled={!dirty}>
              Save slots
            </Button>
          </div>
        </div>
      </div>

      <Preview dirty={dirty} />
    </div>
  );
}

function Preview({ dirty }) {
  const [date, setDate] = useState(todayISO());
  const { serviceAreas, cities } = useConfig();
  const [area, setArea] = useState('');
  const params = area ? { date, area } : { date };
  const groups = cities.map((c) => ({ city: c, areas: serviceAreas.filter((a) => a.city === c) })).filter((g) => g.areas.length);
  const res = useApi('/public/slots', { params, enabled: Boolean(date) });
  // Re-check after a save so the preview reflects new settings.
  const wasDirty = useRef(dirty);
  useEffect(() => {
    if (wasDirty.current && !dirty) res.reload();
    wasDirty.current = dirty;
  }, [dirty]);
  const d = res.data;
  return (
    <Card className="xl:sticky xl:top-4">
      <SectionTitle title="Availability preview" subtitle="What customers see for a date, using saved settings." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />}</Field>
        <Field label="Municipality">
          {(id) => (
            <Select id={id} value={area} onChange={(ev) => setArea(ev.target.value)}>
              <option value="">All areas</option>
              {groups.map((g) => (
                <optgroup key={g.city} label={g.city}>
                  {g.areas.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {!area && <p className="text-xs text-steel-500 mt-2">Capacity is per municipality; with “All areas”, bookings across every area are counted.</p>}
      <div className="mt-4">
        {res.error && !d ? (
          <p className="text-sm text-danger-600" role="alert">{res.error.message}</p>
        ) : !d ? (
          <Spinner />
        ) : (
          <div className={cx('space-y-3 transition-opacity', res.loading && 'opacity-60')}>
            <div className="flex items-center gap-2">
              {d.open ? <CalendarCheck className="w-4 h-4 text-patina-600" aria-hidden /> : <CalendarX className="w-4 h-4 text-danger-600" aria-hidden />}
              <span className="text-sm font-medium text-steel-900">{d.open ? 'Open for booking' : d.reason || 'Closed'}</span>
            </div>
            {d.slots?.length > 0 && (
              <ul className="divide-y divide-steel-100 border border-steel-100 rounded-lg">
                {d.slots.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <span className="text-steel-700">{s.label}</span>
                    {s.available ? (
                      <Badge tone="patina">
                        {s.remaining}/{s.capacity} left
                      </Badge>
                    ) : (
                      <Badge tone="danger">{s.reason}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {dirty && <p className="text-xs text-amber-700 mt-3">Save to preview your changes.</p>}
    </Card>
  );
}
