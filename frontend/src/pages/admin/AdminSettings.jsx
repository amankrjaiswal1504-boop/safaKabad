import { useMemo, useState } from 'react';
import { CalendarClock, Mail, Plus, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import api from '../../services/api';
import useApi from '../../hooks/useApi';
import { rupees } from '../../utils/format';
import { useConfig } from '../../context/ConfigContext';
import { DIAL_CODE, PAYOUT_METHODS, TIMEZONE } from '../../utils/locale';
import { Badge, Button, Card, Field, IconButton, Input, PageHeader, SectionTitle, Select, Tabs, Textarea, Toggle, cx } from '../../components/ui';
import { CURRENCY_SYMBOL } from '../../utils/locale';
import { Async, Callout, NumberInput, isBlank, useAction } from './_catalog/shared';

const TABS = [
  { value: 'support', label: 'Support & WhatsApp' },
  { value: 'home', label: 'Home page & banners' },
  { value: 'ai', label: 'AI assistant' },
  { value: 'rewards', label: 'Rewards' },
  { value: 'collectors', label: 'Collectors' },
  { value: 'fraud', label: 'Fraud limits' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'payments', label: 'Wallet & payments' },
  { value: 'reports', label: 'Daily report' },
];

export default function AdminSettings() {
  const res = useApi('/admin/settings');
  const [tab, setTab] = useState('support');
  const { reloadConfig } = useConfig();
  const onSaved = (key, value) => {
    res.setData((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));
    // Customer and collector apps read these from the public config.
    reloadConfig?.();
  };
  return (
    <div>
      <PageHeader
        title="Site settings"
        subtitle="Content and business rules. Each card saves on its own and takes effect within a minute."
        actions={
          <Button variant="outline" icon={CalendarClock} to="/admin/slots">
            Time slots
          </Button>
        }
      />
      <Tabs className="mb-6" tabs={TABS} value={tab} onChange={setTab} />
      <Async {...res} onRetry={res.reload} rows={5}>
        {(d) => {
          const s = d.settings;
          const card = (key, Comp, extra = {}) => <Comp key={key} settingKey={key} initial={s[key]} onSaved={onSaved} {...extra} />;
          return (
            <div className="space-y-6 max-w-4xl">
              {tab === 'support' && card('support', SupportCard)}
              {tab === 'home' && card('home', HomeCard)}
              {tab === 'ai' && card('ai', AiCard)}
              {tab === 'rewards' && (
                <>
                  {card('referral', ReferralCard)}
                  {card('firstPickupBonus', FirstPickupCard)}
                  {card('loyalty', LoyaltyCard)}
                  {card('business', BusinessTiersCard)}
                </>
              )}
              {tab === 'collectors' && card('collector', CollectorCard)}
              {tab === 'fraud' && card('fraud', FraudCard)}
              {tab === 'pricing' && card('conditionMultipliers', ConditionCard)}
              {tab === 'payments' && (
                <>
                  {card('wallet', WalletCard)}
                  {card('payments', PaymentsCard)}
                </>
              )}
              {tab === 'reports' && card('reports', DailyReportCard)}
            </div>
          );
        }}
      </Async>
    </div>
  );
}

// ---------- Generic section card with its own dirty state & save ----------
function useSection(settingKey, initial, onSaved, validate, serialize = (v) => v) {
  const [base, setBase] = useState(initial);
  const [v, setV] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState('');
  const { busy, run } = useAction();
  const dirty = JSON.stringify(v) !== JSON.stringify(base);
  const errors = useMemo(() => validate?.(v) || {}, [v, validate]);
  const hasErrors = Object.values(errors).some(Boolean);
  const set = (k) => (val) => setV((x) => ({ ...x, [k]: val }));

  async function save() {
    setShowErrors(true);
    if (hasErrors) return;
    const value = serialize(v);
    setServerError('');
    const r = await run('save', () => api.put(`/admin/settings/${settingKey}`, { value }), { success: 'Settings saved' });
    if (!r.ok) setServerError(r.err?.message || 'Could not save');
    if (r.ok) {
      const saved = r.out.data.data.value ?? value;
      setBase(saved);
      setV(saved);
      setShowErrors(false);
      onSaved(settingKey, saved);
    }
  }
  function reset() {
    setV(base);
    setShowErrors(false);
    setServerError('');
  }
  return { v, setV, set, dirty, errors: showErrors ? errors : {}, serverError, save, reset, saving: busy === 'save' };
}

function SectionCard({ title, subtitle, section, children, badge }) {
  const { dirty, save, reset, saving, serverError } = section;
  return (
    <Card padded={false}>
      <div className="p-5">
        <SectionTitle
          title={
            <span className="inline-flex items-center gap-2">
              {title}
              {badge}
            </span>
          }
          subtitle={subtitle}
        />
        <div className="space-y-5">{children}</div>
        {serverError && (
          <p className="mt-4 text-sm text-danger-600" role="alert">
            {serverError}
          </p>
        )}
      </div>
      <div className={cx('flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-steel-100 rounded-b-xl', dirty ? 'bg-rust-50' : 'bg-surface-2')}>
        <span className="text-sm text-steel-600">{dirty ? 'Unsaved changes' : 'Saved'}</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset} disabled={!dirty || saving}>
            Reset
          </Button>
          <Button size="sm" icon={Save} onClick={save} loading={saving} disabled={!dirty}>
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}

const req = (v, { min = 0, max = Infinity, int = false } = {}) => {
  if (isBlank(v)) return 'Required';
  if (v < min) return `At least ${min}`;
  if (v > max) return `At most ${max}`;
  if (int && !Number.isInteger(Number(v))) return 'Whole number';
  return null;
};

function Num({ label, k, s, hint, ...rest }) {
  return (
    <Field label={label} error={s.errors[k]} hint={hint}>
      {(id) => <NumberInput id={id} value={s.v[k]} onChange={s.set(k)} invalid={!!s.errors[k]} {...rest} />}
    </Field>
  );
}

function Text({ label, k, s, hint, multiline, ...rest }) {
  const C = multiline ? Textarea : Input;
  return (
    <Field label={label} error={s.errors[k]} hint={hint}>
      {(id) => <C id={id} value={s.v[k] ?? ''} onChange={(e) => s.set(k)(e.target.value)} invalid={!!s.errors[k]} {...rest} />}
    </Field>
  );
}

const hour12 = (h) => {
  const n = Number(h);
  if (!Number.isFinite(n)) return '';
  const hh = ((n + 11) % 12) + 1;
  return `${hh}:00 ${n < 12 || n === 24 ? 'AM' : 'PM'}`;
};

// ---------- Support ----------
const validateSupport = (v) => ({
  whatsappNumber: v.whatsappNumber && !/^\d{10,15}$/.test(v.whatsappNumber) ? `Digits only with country code, e.g. ${DIAL_CODE}9801234567` : null,
  hoursStart: req(v.hoursStart, { min: 0, max: 23, int: true }),
  hoursEnd: req(v.hoursEnd, { min: 1, max: 24, int: true }) || (Number(v.hoursEnd) <= Number(v.hoursStart) ? 'Must be after the opening hour' : null),
  replyMinutes: req(v.replyMinutes, { min: 1, max: 1440, int: true }),
  email: v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ? 'Enter a valid email' : null,
  timezone: !v.timezone ? 'Required' : null,
});

function SupportCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, { ...initial, timezone: initial?.timezone || TIMEZONE }, onSaved, validateSupport, (v) => ({ ...v, whatsappNumber: String(v.whatsappNumber || '').replace(/\D/g, '') }));
  return (
    <SectionCard title="Support & WhatsApp" subtitle="Shown in the chat widget, footer and help pages." section={s}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="WhatsApp number" error={s.errors.whatsappNumber} hint="Country code + number, digits only">
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              value={s.v.whatsappNumber || ''}
              onChange={(e) => s.set('whatsappNumber')(e.target.value.replace(/[^\d]/g, ''))}
              placeholder={`${DIAL_CODE}9801234567`}
              invalid={!!s.errors.whatsappNumber}
            />
          )}
        </Field>
        <Text label="Support phone" k="phone" s={s} type="tel" />
        <Text label="Support email" k="email" s={s} type="email" />
        <Text label="Timezone" k="timezone" s={s} placeholder={TIMEZONE} hint={`IANA name, e.g. ${TIMEZONE}`} />
        <Num label="Opens at (hour, 0–23)" k="hoursStart" s={s} min={0} max={23} hint={hour12(s.v.hoursStart)} />
        <Num label="Closes at (hour, 1–24)" k="hoursEnd" s={s} min={1} max={24} hint={hour12(s.v.hoursEnd)} />
        <Num label="Typical reply time (minutes)" k="replyMinutes" s={s} min={1} hint="Shown as “We usually reply in …”" />
      </div>
    </SectionCard>
  );
}

// ---------- Home ----------
const validateHome = (v) => {
  const e = {
    heroTitle: !v.heroTitle?.trim() ? 'Required' : v.heroTitle.length > 140 ? 'Keep it under 140 characters' : null,
    heroSubtitle: v.heroSubtitle?.length > 300 ? 'Keep it under 300 characters' : null,
  };
  (v.banners || []).forEach((b, i) => {
    if (!b.text?.trim()) e[`banner${i}`] = 'Banner text is required';
    else if (b.link && !/^(\/|https?:\/\/)/.test(b.link)) e[`banner${i}`] = 'Link must start with / or https://';
  });
  const so = v.statsOverride || {};
  if (so.enabled) ['kgRecycled', 'pickups', 'cities'].forEach((k) => (e[`so_${k}`] = req(so[k], { min: 0 })));
  if (so.enabled) e.so_rating = req(so.rating, { min: 0, max: 5 });
  return e;
};

function HomeCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, initial, onSaved, validateHome);
  const banners = s.v.banners || [];
  const so = s.v.statsOverride || {};
  const setBanner = (i, k, val) => s.set('banners')(banners.map((b, j) => (j === i ? { ...b, [k]: val } : b)));
  const setSo = (k) => (val) => s.set('statsOverride')({ ...so, [k]: val });
  return (
    <SectionCard title="Home page" subtitle="Hero text, announcement banners and the headline numbers." section={s}>
      <Text label="Hero title" k="heroTitle" s={s} maxLength={140} />
      <Text label="Hero subtitle" k="heroSubtitle" s={s} multiline rows={2} maxLength={300} />

      <div className="border-t border-steel-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-steel-900">Banners</h3>
            <p className="text-xs text-steel-500">Active banners rotate in the strip at the top of the site.</p>
          </div>
          <Button variant="outline" size="sm" icon={Plus} onClick={() => s.set('banners')([...banners, { text: '', link: '', active: true }])}>
            Add banner
          </Button>
        </div>
        {banners.length === 0 && <p className="text-sm text-steel-500">No banners.</p>}
        <ul className="space-y-3">
          {banners.map((b, i) => (
            <li key={i} className="p-3 rounded-lg border border-steel-100 bg-surface-2 space-y-3">
              <div className="grid sm:grid-cols-[1fr_200px] gap-3">
                <Field label={`Banner ${i + 1} text`} error={s.errors[`banner${i}`]}>
                  {(id) => <Input id={id} value={b.text} onChange={(e) => setBanner(i, 'text', e.target.value)} maxLength={160} invalid={!!s.errors[`banner${i}`]} />}
                </Field>
                <Field label="Link" hint="e.g. /schedule-pickup">
                  {(id) => <Input id={id} value={b.link || ''} onChange={(e) => setBanner(i, 'link', e.target.value)} placeholder="/schedule-pickup" />}
                </Field>
              </div>
              <div className="flex items-center justify-between">
                <Toggle checked={b.active !== false} onChange={(val) => setBanner(i, 'active', val)} label="Active" />
                <IconButton label={`Remove banner ${i + 1}`} icon={Trash2} onClick={() => s.set('banners')(banners.filter((_, j) => j !== i))} className="hover:!text-danger-600" />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-steel-100 pt-5 space-y-4">
        <Toggle
          checked={!!so.enabled}
          onChange={setSo('enabled')}
          label="Override headline stats"
          description="By default the home page shows live totals. Turn on to show fixed numbers instead (e.g. at launch)."
        />
        {so.enabled && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              ['kgRecycled', 'Kg recycled'],
              ['pickups', 'Pickups'],
              ['cities', 'Cities'],
              ['rating', 'Rating (0–5)'],
            ].map(([k, label]) => (
              <Field key={k} label={label} error={s.errors[`so_${k}`]}>
                {(id) => <NumberInput id={id} min={0} step={k === 'rating' ? 0.1 : 1} value={so[k]} onChange={setSo(k)} invalid={!!s.errors[`so_${k}`]} />}
              </Field>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ---------- AI ----------
function AiCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, initial, onSaved, (v) => ({ greeting: v.greeting?.length > 300 ? 'Keep it under 300 characters' : null }));
  return (
    <SectionCard
      title="AI assistant"
      subtitle="The chat assistant answers from your FAQs and live prices."
      section={s}
      badge={s.v.enabled ? <Badge tone="patina">On</Badge> : <Badge>Off</Badge>}
    >
      <Toggle
        checked={!!s.v.enabled}
        onChange={s.set('enabled')}
        label="Use AI replies"
        description="When off, the assistant uses rule-based answers and FAQs only. Escalation to a human always works."
      />
      <Text label="Greeting message" k="greeting" s={s} multiline rows={3} maxLength={300} hint="Leave empty for the default greeting" />
    </SectionCard>
  );
}

// ---------- Rewards ----------
function ReferralCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, initial, onSaved, (v) => ({ referrerReward: req(v.referrerReward, { max: 10000 }), refereeReward: req(v.refereeReward, { max: 10000 }) }));
  return (
    <SectionCard title="Referrals" subtitle="Wallet credit after the referred friend's first completed pickup." section={s}>
      <Toggle checked={!!s.v.enabled} onChange={s.set('enabled')} label="Referral programme on" />
      <div className="grid grid-cols-2 gap-4">
        <Num label={`Referrer gets (${CURRENCY_SYMBOL})`} k="referrerReward" s={s} min={0} />
        <Num label={`New customer gets (${CURRENCY_SYMBOL})`} k="refereeReward" s={s} min={0} />
      </div>
    </SectionCard>
  );
}

function FirstPickupCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, initial, onSaved, (v) => ({ percent: req(v.percent, { max: 100 }), maxBonus: req(v.maxBonus, { max: 100000 }) }));
  return (
    <SectionCard title="First pickup bonus" subtitle="Applied automatically to a customer's first completed pickup." section={s}>
      <Toggle checked={!!s.v.enabled} onChange={s.set('enabled')} label="Bonus on" />
      <div className="grid grid-cols-2 gap-4">
        <Num label="Bonus (%)" k="percent" s={s} min={0} max={100} step={0.5} />
        <Num label={`Max bonus (${CURRENCY_SYMBOL})`} k="maxBonus" s={s} min={0} />
      </div>
      {s.v.enabled && !isBlank(s.v.percent) && (
        <p className="text-sm text-steel-600">
          A {rupees(1000)} first pickup earns {rupees(Math.min((1000 * s.v.percent) / 100, s.v.maxBonus || Infinity))} extra.
        </p>
      )}
    </SectionCard>
  );
}

function TierEditor({ s, thresholdKey, thresholdLabel, nameHint }) {
  const tiers = s.v.tiers || [];
  const setTier = (i, k, val) => s.set('tiers')(tiers.map((t, j) => (j === i ? { ...t, [k]: val } : t)));
  return (
    <div className="space-y-3">
      {s.errors.tiers && <p className="text-sm text-danger-600" role="alert">{s.errors.tiers}</p>}
      <ul className="space-y-2">
        {tiers.map((t, i) => (
          <li key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
            <Field label={i === 0 ? 'Tier name' : undefined} error={s.errors[`t${i}_name`]} hint={i === 0 ? nameHint : undefined}>
              {(id) => <Input id={id} aria-label={`Tier ${i + 1} name`} value={t.name} onChange={(e) => setTier(i, 'name', e.target.value)} invalid={!!s.errors[`t${i}_name`]} />}
            </Field>
            <Field label={i === 0 ? thresholdLabel : undefined} error={s.errors[`t${i}_min`]}>
              {(id) => (
                <NumberInput id={id} aria-label={`Tier ${i + 1} ${thresholdLabel}`} min={0} value={t[thresholdKey]} onChange={(val) => setTier(i, thresholdKey, val)} invalid={!!s.errors[`t${i}_min`]} />
              )}
            </Field>
            <Field label={i === 0 ? 'Bonus %' : undefined} error={s.errors[`t${i}_bonus`]}>
              {(id) => (
                <NumberInput id={id} aria-label={`Tier ${i + 1} bonus percent`} min={0} max={100} step={0.5} value={t.bonusPercent} onChange={(val) => setTier(i, 'bonusPercent', val)} invalid={!!s.errors[`t${i}_bonus`]} />
              )}
            </Field>
            <IconButton
              label={`Remove tier ${t.name || i + 1}`}
              icon={Trash2}
              onClick={() => s.set('tiers')(tiers.filter((_, j) => j !== i))}
              className={cx('hover:!text-danger-600', i === 0 && 'mt-7')}
            />
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" icon={Plus} onClick={() => s.set('tiers')([...tiers, { name: '', [thresholdKey]: '', bonusPercent: 0 }])}>
        Add tier
      </Button>
    </div>
  );
}

const tierValidator = (thresholdKey) => (v) => {
  const e = {};
  const tiers = v.tiers || [];
  if (!tiers.length) e.tiers = 'Add at least one tier';
  tiers.forEach((t, i) => {
    e[`t${i}_name`] = !t.name?.trim() ? 'Required' : null;
    e[`t${i}_min`] = req(t[thresholdKey], { min: 0 });
    e[`t${i}_bonus`] = req(t.bonusPercent, { min: 0, max: 100 });
  });
  if (tiers.length && !e.tiers && tiers.every((t) => !isBlank(t[thresholdKey])) && !tiers.some((t) => Number(t[thresholdKey]) === 0))
    e.tiers = 'One tier should start at 0 so every customer has a tier';
  return e;
};
const sortTiers = (thresholdKey) => (v) => ({
  ...v,
  tiers: [...v.tiers].map((t) => ({ ...t, name: t.name.trim() })).sort((a, b) => a[thresholdKey] - b[thresholdKey]),
});

const loyaltyValidate = tierValidator('minKg');
const loyaltySerialize = sortTiers('minKg');
function LoyaltyCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, initial, onSaved, loyaltyValidate, loyaltySerialize);
  return (
    <SectionCard title="Loyalty tiers" subtitle="Customers move up by total kg recycled and earn a bonus % on every pickup." section={s}>
      <TierEditor s={s} thresholdKey="minKg" thresholdLabel="From (kg)" />
    </SectionCard>
  );
}

const businessValidate = tierValidator('minMonthlyKg');
const businessSerialize = sortTiers('minMonthlyKg');
function BusinessTiersCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, initial, onSaved, businessValidate, businessSerialize);
  return (
    <SectionCard title="Business pricing tiers" subtitle="Bonus % for business accounts by monthly volume. Assign tiers on the customer's profile." section={s}>
      <TierEditor s={s} thresholdKey="minMonthlyKg" thresholdLabel="From (kg / month)" nameHint="Lowercase id, e.g. gold" />
    </SectionCard>
  );
}

// ---------- Collectors ----------
const validateCollector = (v) => ({
  baseFeePerPickup: req(v.baseFeePerPickup, { max: 10000 }),
  commissionPercent: req(v.commissionPercent, { max: 50 }),
  weeklyBonusThreshold: req(v.weeklyBonusThreshold, { int: true, max: 1000 }),
  weeklyBonusAmount: req(v.weeklyBonusAmount, { max: 100000 }),
});
function CollectorCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, initial, onSaved, validateCollector);
  const example = !isBlank(s.v.baseFeePerPickup) && !isBlank(s.v.commissionPercent) ? Number(s.v.baseFeePerPickup) + (500 * s.v.commissionPercent) / 100 : null;
  return (
    <SectionCard title="Collector earnings & dispatch" subtitle="How collectors are paid and how new pickups are assigned." section={s}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Num label={`Base fee per pickup (${CURRENCY_SYMBOL})`} k="baseFeePerPickup" s={s} min={0} />
        <Num label="Commission (% of pickup value)" k="commissionPercent" s={s} min={0} max={50} step={0.5} hint="Individual collectors can have their own rate" />
        <Num label="Weekly bonus after (pickups)" k="weeklyBonusThreshold" s={s} min={0} step={1} />
        <Num label={`Weekly bonus (${CURRENCY_SYMBOL})`} k="weeklyBonusAmount" s={s} min={0} />
      </div>
      {example != null && <p className="text-sm text-steel-600">A {rupees(500)} pickup earns the collector {rupees(example, { decimals: 2 })}.</p>}
      <Toggle checked={!!s.v.autoAssign} onChange={s.set('autoAssign')} label="Auto-assign new pickups" description="On booking, assign the best collector: serves that municipality first, then lightest load that day, then nearest." />
    </SectionCard>
  );
}

// ---------- Fraud ----------
const validateFraud = (v) => ({
  maxActiveBookings: req(v.maxActiveBookings, { min: 1, max: 100, int: true }),
  maxCancellationsPer30Days: req(v.maxCancellationsPer30Days, { min: 1, max: 100, int: true }),
  duplicateWindowHours: req(v.duplicateWindowHours, { min: 0, max: 720, int: true }),
});
function FraudCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, initial, onSaved, validateFraud);
  return (
    <SectionCard title="Fraud & abuse limits" subtitle="Bookings over these limits are blocked or flagged for review." section={s}>
      <div className="grid sm:grid-cols-3 gap-4">
        <Num label="Max active bookings" k="maxActiveBookings" s={s} min={1} step={1} hint="Per customer at once" />
        <Num label="Max cancellations / 30 days" k="maxCancellationsPer30Days" s={s} min={1} step={1} hint="Customer cancellations; then booking is blocked" />
        <Num label="Duplicate window (hours)" k="duplicateWindowHours" s={s} min={0} step={1} hint="Same items, same day: flagged for review" />
      </div>
      <Callout>Blocked phones, emails and postal codes are managed on the Fraud & abuse page.</Callout>
    </SectionCard>
  );
}

// ---------- Pricing ----------
const CONDITIONS = [
  ['working', 'Working'],
  ['not_working', 'Not working'],
  ['damaged', 'Damaged'],
];
const validateConditions = (v) => Object.fromEntries(CONDITIONS.map(([k]) => [k, req(v[k], { min: 0, max: 2 })]));
function ConditionCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, initial, onSaved, validateConditions);
  return (
    <SectionCard title="Condition multipliers" subtitle="For categories with condition grading, the item price is multiplied by these." section={s}>
      <div className="grid grid-cols-3 gap-4">
        {CONDITIONS.map(([k, label]) => (
          <Num key={k} label={label} k={k} s={s} min={0} max={2} step={0.05} hint={!isBlank(s.v[k]) ? `${Math.round(s.v[k] * 100)}% of price` : undefined} />
        ))}
      </div>
      <p className="text-sm text-steel-600">
        Example: an item priced at {rupees(1000)} pays{' '}
        {CONDITIONS.map(([k, label], i) => (
          <span key={k}>
            {i > 0 && (i === CONDITIONS.length - 1 ? ' and ' : ', ')}
            {rupees((Number(s.v[k]) || 0) * 1000)} {label.toLowerCase()}
          </span>
        ))}
        .
      </p>
      <p className="text-xs text-steel-500">Turn condition grading on per category under Categories & items.</p>
    </SectionCard>
  );
}

// ---------- Wallet & payments ----------
const validateWallet = (v) => ({
  minWithdrawal: req(v.minWithdrawal, { min: 1, int: true }),
  maxWithdrawal:
    req(v.maxWithdrawal, { min: 1, int: true }) ||
    (!isBlank(v.minWithdrawal) && Number(v.maxWithdrawal) < Number(v.minWithdrawal) ? 'Must be at least the minimum' : null),
});
const serializeWallet = (v) => ({ minWithdrawal: Number(v.minWithdrawal), maxWithdrawal: Number(v.maxWithdrawal) });
function WalletCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, initial || {}, onSaved, validateWallet, serializeWallet);
  return (
    <SectionCard title="Wallet" subtitle="Limits for each customer withdrawal from the ScrapMate wallet." section={s}>
      <div className="grid grid-cols-2 gap-4">
        <Num label={`Minimum withdrawal (${CURRENCY_SYMBOL})`} k="minWithdrawal" s={s} min={1} step={1} />
        <Num label={`Maximum withdrawal (${CURRENCY_SYMBOL})`} k="maxWithdrawal" s={s} min={1} step={1} />
      </div>
      {!isBlank(s.v.minWithdrawal) && !isBlank(s.v.maxWithdrawal) && (
        <p className="text-sm text-steel-600">
          Customers can withdraw between {rupees(s.v.minWithdrawal)} and {rupees(s.v.maxWithdrawal)} at a time.
        </p>
      )}
    </SectionCard>
  );
}

// Cash and the wallet itself can't be withdrawal destinations.
const WITHDRAWAL_OPTIONS = PAYOUT_METHODS.filter((m) => m.value !== 'cash' && m.value !== 'wallet');
const validatePayments = (v) => ({
  payoutMethods: !v.payoutMethods?.length ? 'Keep at least one payout method' : null,
  withdrawalMethods: !v.withdrawalMethods?.length ? 'Keep at least one withdrawal method' : null,
});

function MethodChecklist({ legend, description, options, value = [], onChange, error }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-steel-900">{legend}</legend>
      {description && <p className="text-xs text-steel-500 mt-0.5 mb-3">{description}</p>}
      <div className="grid sm:grid-cols-2 gap-2">
        {options.map((m) => {
          const on = value.includes(m.value);
          return (
            <label
              key={m.value}
              className={cx('flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors', on ? 'border-rust-500 bg-rust-50' : 'border-steel-200 hover:border-steel-400')}
            >
              <input
                type="checkbox"
                className="accent-rust-600"
                checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== m.value) : [...value, m.value])}
              />
              <span className="text-steel-900">{m.label}</span>
            </label>
          );
        })}
      </div>
      {error && (
        <p className="text-danger-600 text-xs mt-1.5" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function PaymentsCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, { payoutMethods: initial?.payoutMethods || [], withdrawalMethods: initial?.withdrawalMethods || [] }, onSaved, validatePayments);
  return (
    <SectionCard title="Payments" subtitle="Which payment options are switched on across the apps." section={s}>
      <MethodChecklist
        legend="Payout methods"
        description="How collectors can pay customers at pickup."
        options={PAYOUT_METHODS}
        value={s.v.payoutMethods}
        onChange={s.set('payoutMethods')}
        error={s.errors.payoutMethods}
      />
      <MethodChecklist
        legend="Withdrawal methods"
        description="Where customers can withdraw their wallet balance to."
        options={WITHDRAWAL_OPTIONS}
        value={s.v.withdrawalMethods}
        onChange={s.set('withdrawalMethods')}
        error={s.errors.withdrawalMethods}
      />
    </SectionCard>
  );
}

// ---------- Daily report email ----------
const EMAIL_OK = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
const validateReports = (v) => ({
  primaryEmail: v.dailyEnabled && !String(v.primaryEmail || '').trim() ? 'Required to send the daily report' : v.primaryEmail && !EMAIL_OK(v.primaryEmail) ? 'Enter a valid email' : null,
  secondaryEmail:
    v.secondaryEmail && !EMAIL_OK(v.secondaryEmail)
      ? 'Enter a valid email'
      : v.secondaryEmail && v.secondaryEmail.trim().toLowerCase() === String(v.primaryEmail || '').trim().toLowerCase()
        ? 'Use a different email from the primary'
        : null,
});
const fmtDayLong = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

function DailyReportCard({ settingKey, initial, onSaved }) {
  const s = useSection(settingKey, { dailyEnabled: true, sendHour: 20, primaryEmail: '', secondaryEmail: '', copySecondary: false, ...initial }, onSaved, validateReports);
  const status = useApi('/admin/reports/daily');
  const { busy, run } = useAction();
  const st = status.data;

  async function sendNow() {
    const r = await run('send', () => api.post('/admin/reports/daily/send'), {
      success: (out) => {
        const d = out.data.data;
        return d.mock ? 'Report built. Email isn’t set up on the server yet, so it was only logged.' : `Report sent to ${d.to}${d.cc ? ` (copy to ${d.cc})` : ''}`;
      },
    });
    if (r.ok) status.reload();
  }

  return (
    <SectionCard
      title="Daily pickup report"
      subtitle={`Every evening we email a summary of the day's pickups and tomorrow's schedule (${TIMEZONE}).`}
      section={s}
      badge={s.v.dailyEnabled ? <Badge tone="patina">On</Badge> : <Badge>Off</Badge>}
    >
      <Toggle checked={!!s.v.dailyEnabled} onChange={s.set('dailyEnabled')} label="Send the daily report automatically" description="Includes completed, open and cancelled pickups, kg collected, amount paid, new bookings, tomorrow's list and a CSV file." />

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Primary email" required error={s.errors.primaryEmail} hint="The daily report is sent here.">
          {(id) => <Input id={id} type="email" value={s.v.primaryEmail || ''} onChange={(e) => s.set('primaryEmail')(e.target.value)} placeholder="ops@yourcompany.com" invalid={!!s.errors.primaryEmail} autoComplete="email" />}
        </Field>
        <Field label="Secondary email" error={s.errors.secondaryEmail} hint="Optional backup contact.">
          {(id) => (
            <Input
              id={id}
              type="email"
              value={s.v.secondaryEmail || ''}
              onChange={(e) => {
                s.set('secondaryEmail')(e.target.value);
                if (!e.target.value) s.set('copySecondary')(false);
              }}
              placeholder="owner@yourcompany.com"
              invalid={!!s.errors.secondaryEmail}
              autoComplete="email"
            />
          )}
        </Field>
        <Field label="Send at" hint="Nepal time. The report covers that whole day.">
          {(id) => (
            <Select id={id} value={s.v.sendHour ?? 20} onChange={(e) => s.set('sendHour')(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hour12(h)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="sm:pt-7">
          <Toggle checked={!!s.v.copySecondary} onChange={s.set('copySecondary')} disabled={!s.v.secondaryEmail} label="Also send a copy to the secondary email" />
        </div>
      </div>

      <div className="rounded-xl border border-steel-200/70 bg-surface-2 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3 text-sm">
          <Mail className="w-5 h-5 text-rust-600 mt-0.5 shrink-0" aria-hidden />
          <div>
            <div className="font-medium text-steel-900">{st?.lastSentDay ? `Last sent for ${fmtDayLong(st.lastSentDay)}` : 'Not sent yet'}</div>
            <div className="text-steel-500">
              {s.v.dailyEnabled && s.v.primaryEmail ? `Sends every day at ${hour12(s.v.sendHour ?? 20)} to ${s.v.primaryEmail}${s.v.copySecondary && s.v.secondaryEmail ? ` (copy to ${s.v.secondaryEmail})` : ''}` : 'Turn it on and add a primary email to schedule it.'}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" icon={Send} onClick={sendNow} loading={busy === 'send'} disabled={s.dirty || !initial?.primaryEmail}>
          Send a test now
        </Button>
      </div>
      {s.dirty && <p className="text-xs text-steel-500 -mt-2">Save your changes before sending a test.</p>}
      {st && !st.emailConfigured && (
        <Callout tone="amber">
          Email sending isn’t set up on the server yet, so reports are only written to the server log. Add <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>SMTP_FROM</code> to the backend’s
          environment (for example in Render › Environment).
        </Callout>
      )}
    </SectionCard>
  );
}
