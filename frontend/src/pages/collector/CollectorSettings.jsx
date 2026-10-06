import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock, MapPinned, Palette, Plus, Save, Truck, User, X } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PreferenceButtons } from '../../components/Navbar';
import { Button, Card, Field, Input, Stars, Toggle, cx } from '../../components/ui';
import { POSTAL_CODE_RE } from '../../utils/locale';

const PIN_RE = POSTAL_CODE_RE;

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
  const profile = user?.collectorProfile || {};

  const [available, setAvailable] = useState(profile.isAvailable !== false);
  const [savingAvail, setSavingAvail] = useState(false);
  const [start, setStart] = useState(profile.workingHours?.start || '09:00');
  const [end, setEnd] = useState(profile.workingHours?.end || '19:00');
  const [pins, setPins] = useState(profile.servicePinCodes || []);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [hoursError, setHoursError] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-sync when the profile is refreshed elsewhere.
  useEffect(() => {
    setAvailable(profile.isAvailable !== false);
  }, [profile.isAvailable]);
  const savedKey = JSON.stringify([profile.workingHours, profile.servicePinCodes]);
  useEffect(() => {
    setStart(profile.workingHours?.start || '09:00');
    setEnd(profile.workingHours?.end || '19:00');
    setPins(profile.servicePinCodes || []);
  }, [savedKey]);

  const dirty = useMemo(
    () =>
      start !== (profile.workingHours?.start || '09:00') ||
      end !== (profile.workingHours?.end || '19:00') ||
      JSON.stringify(pins) !== JSON.stringify(profile.servicePinCodes || []),
    [start, end, pins, profile.workingHours, profile.servicePinCodes]
  );

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

  function addPins() {
    const found = pinInput.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
    if (!found.length) return;
    const bad = found.filter((p) => !PIN_RE.test(p));
    if (bad.length) {
      setPinError(`${bad.join(', ')} ${bad.length > 1 ? "aren't" : "isn't"} a valid 5-digit postal code`);
      return;
    }
    const next = [...new Set([...pins, ...found])];
    if (next.length > 50) {
      setPinError('You can serve up to 50 postal codes');
      return;
    }
    setPins(next);
    setPinInput('');
    setPinError('');
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
    if (pinInput.trim()) {
      setPinError('Tap Add to include the postal code you typed, or clear it');
      return;
    }
    setSaving(true);
    try {
      await api.put('/collector/availability', { workingHours: { start, end }, servicePinCodes: pins });
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

        <Section icon={MapPinned} title="Service postal codes" subtitle="Areas where you take pickups.">
          <Field label="Add postal code" error={pinError} hint="5 digits. Separate several with commas or spaces.">
            {(id) => (
              <div className="flex gap-2">
                <Input
                  id={id}
                  inputMode="numeric"
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value.replace(/[^\d,\s]/g, ''));
                    setPinError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addPins();
                    }
                  }}
                  placeholder="44600"
                  invalid={Boolean(pinError)}
                  className="min-h-[48px] tabular"
                />
                <Button variant="outline" icon={Plus} onClick={addPins} className="min-h-[48px] shrink-0">
                  Add
                </Button>
              </div>
            )}
          </Field>
          {pins.length ? (
            <ul className="flex flex-wrap gap-2 mt-4" aria-label="Service postal codes">
              {pins.map((p) => (
                <li key={p} className="inline-flex items-center gap-1 rounded-full bg-steel-100 text-steel-800 pl-3 pr-1 h-9 text-sm font-medium tabular">
                  {p}
                  <button
                    type="button"
                    onClick={() => setPins(pins.filter((x) => x !== p))}
                    className="w-7 h-7 rounded-full inline-flex items-center justify-center text-steel-500 hover:bg-steel-200 hover:text-steel-900"
                    aria-label={`Remove postal code ${p}`}
                  >
                    <X className="w-4 h-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-amber-700 mt-3">No postal codes yet — you may get pickups from anywhere in your city.</p>
          )}
        </Section>

        <Button type="submit" size="lg" icon={Save} loading={saving} disabled={!dirty && !pinInput} className="w-full min-h-[52px]">
          {dirty ? 'Save changes' : 'Saved'}
        </Button>
      </form>

      <Section icon={User} title="Profile" subtitle="Contact ScrapMate support to change these details.">
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
