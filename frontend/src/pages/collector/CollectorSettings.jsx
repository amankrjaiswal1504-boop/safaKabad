import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Clock, MapPinned, Palette, Save, Truck, User } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { PreferenceButtons } from '../../components/Navbar';
import { Button, Card, EmptyState, Field, Input, Skeleton, Stars, Toggle, cx } from '../../components/ui';
import { areaTypeLabel } from '../../utils/locale';

const sortedKey = (ids) => JSON.stringify([...ids].map(String).sort());

function wardsLabel(area) {
  const served = area.servedWards || [];
  if (served.length && served.length < (area.wards || 0)) return `Wards ${served.join(', ')}`;
  return area.wards ? `${area.wards} wards` : '';
}

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <Card className="!p-4 sm:!p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-10 h-10 rounded-lg bg-steel-100 text-steel-700 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-steel-900">{title}</h2>
          {subtitle && <p className="text-sm text-steel-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

export default function CollectorSettings() {
  const { user, refreshMe } = useAuth();
  const { areasFor, loading: configLoading } = useConfig();
  const profile = user?.collectorProfile || {};
  const areas = useMemo(() => (profile.city ? areasFor(profile.city) : []), [areasFor, profile.city]);
  const savedAreas = useMemo(() => (profile.serviceAreas || []).map(String), [profile.serviceAreas]);

  const [available, setAvailable] = useState(profile.isAvailable !== false);
  const [savingAvail, setSavingAvail] = useState(false);
  const [start, setStart] = useState(profile.workingHours?.start || '09:00');
  const [end, setEnd] = useState(profile.workingHours?.end || '19:00');
  const [selected, setSelected] = useState(savedAreas);
  const [hoursError, setHoursError] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-sync when the profile is refreshed elsewhere.
  useEffect(() => {
    setAvailable(profile.isAvailable !== false);
  }, [profile.isAvailable]);
  const savedKey = JSON.stringify([profile.workingHours, savedAreas]);
  useEffect(() => {
    setStart(profile.workingHours?.start || '09:00');
    setEnd(profile.workingHours?.end || '19:00');
    setSelected(savedAreas);
  }, [savedKey]);

  // Only municipalities the office currently lists for this city count; any
  // other saved id (e.g. a deactivated area) is dropped on the next save.
  const areaIds = useMemo(() => areas.map((a) => String(a._id)), [areas]);
  const chosen = useMemo(() => selected.filter((id) => areaIds.includes(id)), [selected, areaIds]);
  const allSelected = areaIds.length > 0 && chosen.length === areaIds.length;
  const areasDirty = areaIds.length > 0 && sortedKey(chosen) !== sortedKey(savedAreas);

  const dirty = start !== (profile.workingHours?.start || '09:00') || end !== (profile.workingHours?.end || '19:00') || areasDirty;

  function toggleArea(id) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function toggleAvailability(next) {
    setAvailable(next);
    setSavingAvail(true);
    try {
      await api.put('/collector/availability', { isAvailable: next });
      await refreshMe();
      toast.success(next ? "You're available for new pickups" : "You're off duty");
    } catch (err) {
      setAvailable(!next);
      toast.error(err.message);
    } finally {
      setSavingAvail(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      setHoursError('Enter both start and end times');
      return;
    }
    if (start >= end) {
      setHoursError('End time must be after start time');
      return;
    }
    setHoursError('');
    setSaving(true);
    try {
      const body = { workingHours: { start, end } };
      if (areaIds.length) body.serviceAreas = chosen;
      await api.put('/collector/availability', body);
      await refreshMe();
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-head text-2xl font-semibold text-steel-900 leading-tight">Settings</h1>
        <p className="text-sm text-steel-500 mt-1">Your availability, hours and service area</p>
      </div>

      <Card className={cx('!p-4 border-2', available ? '!border-patina-200 bg-patina-50' : '!border-steel-200')}>
        <Toggle
          checked={available}
          disabled={savingAvail}
          onChange={toggleAvailability}
          label={available ? 'Available for pickups' : 'Off duty'}
          description="When off, no new pickups are assigned to you. Your current jobs stay with you."
        />
      </Card>

      <form onSubmit={save} className="space-y-5" noValidate>
        <Section icon={Clock} title="Working hours" subtitle="Pickups are assigned inside these hours.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              {(id) => <Input id={id} type="time" value={start} onChange={(e) => setStart(e.target.value)} className="min-h-[48px]" invalid={Boolean(hoursError)} />}
            </Field>
            <Field label="End">
              {(id) => <Input id={id} type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="min-h-[48px]" invalid={Boolean(hoursError)} />}
            </Field>
          </div>
          {hoursError && (
            <p className="text-danger-600 text-xs mt-1.5" role="alert">
              {hoursError}
            </p>
          )}
        </Section>

        <Section
          icon={MapPinned}
          title="Service areas"
          subtitle={profile.city ? `Municipalities in ${profile.city} where you take pickups.` : 'Municipalities where you take pickups.'}
        >
          {configLoading ? (
            <div className="space-y-2" role="status" aria-label="Loading service areas">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : areas.length === 0 ? (
            <EmptyState
              icon={MapPinned}
              title="No areas set up yet"
              description={`Ask the office to add your areas${profile.city ? ` in ${profile.city}` : ''}. Until then you may get pickups from anywhere in your city.`}
              className="!py-6 !px-4"
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm text-steel-600 tabular" aria-live="polite">
                  {chosen.length} of {areas.length} selected
                </p>
                <Button variant="ghost" size="sm" onClick={() => setSelected(allSelected ? [] : areaIds)} className="min-h-[44px]">
                  {allSelected ? 'Clear all' : 'Select all'}
                </Button>
              </div>
              <ul className="space-y-2" aria-label="Service areas">
                {areas.map((area) => {
                  const aid = String(area._id);
                  const on = chosen.includes(aid);
                  const meta = [areaTypeLabel(area.type), wardsLabel(area)].filter(Boolean).join(' · ');
                  return (
                    <li key={aid}>
                      <label
                        className={cx(
                          'flex items-center gap-3 min-h-[56px] px-3 py-2 rounded-xl border cursor-pointer transition-colors',
                          on ? 'border-rust-600 bg-rust-50' : 'border-steel-200 hover:bg-steel-50'
                        )}
                      >
                        <input type="checkbox" className="sr-only peer" checked={on} onChange={() => toggleArea(aid)} />
                        <span
                          className={cx(
                            'w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-rust-500/40',
                            on ? 'bg-rust-600 border-rust-600 text-white' : 'border-steel-300 bg-surface'
                          )}
                          aria-hidden
                        >
                          {on && <Check className="w-4 h-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-steel-900">
                            {area.name}
                            {area.nameNe && <span className="font-normal text-steel-500 ml-1.5">{area.nameNe}</span>}
                          </span>
                          {meta && <span className="block text-xs text-steel-500 tabular">{meta}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {chosen.length === 0 && (
                <p className="text-sm text-amber-700 mt-3">No areas selected — you may get pickups from anywhere in {profile.city || 'your city'}.</p>
              )}
              {chosen.length > 0 && <p className="text-xs text-steel-500 mt-3">Pickups in these areas come to you first. You may still get the odd job elsewhere in {profile.city || 'your city'}.</p>}
            </>
          )}
        </Section>

        <Button type="submit" size="lg" icon={Save} loading={saving} disabled={!dirty} className="w-full min-h-[52px]">
          {dirty ? 'Save changes' : 'Saved'}
        </Button>
      </form>

      <Section icon={User} title="Profile" subtitle="Contact SafaKabad support to change these details.">
        <dl className="divide-y divide-steel-100 text-sm">
          {[
            ['Name', user?.name],
            ['Phone', user?.phone],
            ['Email', user?.email],
            ['City', profile.city],
            [
              'Vehicle',
              profile.vehicleNumber ? (
                <span className="inline-flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-steel-500" aria-hidden />
                  {profile.vehicleNumber}
                </span>
              ) : null,
            ],
            [
              'Rating',
              <span key="r" className="inline-flex items-center gap-1.5">
                <Stars value={profile.rating || 0} size="w-3.5 h-3.5" />
                <span className="tabular">{profile.rating ? Number(profile.rating).toFixed(1) : 'New'}</span>
                {profile.ratingCount ? <span className="text-steel-500 tabular">({profile.ratingCount})</span> : null}
              </span>,
            ],
            ['Pickups completed', <span key="c" className="tabular">{profile.totalPickupsCompleted || 0}</span>],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-steel-500">{k}</dt>
              <dd className="text-steel-900 font-medium text-right min-w-0 truncate">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section icon={Palette} title="Appearance & language" subtitle="Dark mode helps at night; Nepali is available for most screens.">
        <div className="flex items-center gap-2">
          <PreferenceButtons />
        </div>
        <p className="text-xs text-steel-500 mt-2">
          Your choice is remembered on this phone.
        </p>
      </Section>
    </div>
  );
}
