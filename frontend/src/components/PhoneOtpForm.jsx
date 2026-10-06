import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { Button, Field, Input } from './ui';
import OtpInput from './OtpInput';
import { DIAL_CODE, MOBILE_PLACEHOLDER, MOBILE_RE, cleanPhone as clean } from '../utils/locale';

// Phone + OTP. purpose 'login' signs in (creating the account if new);
// purpose 'booking' only verifies and hands the code to onVerified (guest booking).
export default function PhoneOtpForm({ purpose = 'login', onVerified, askName = true, submitLabel, referralCode }) {
  const { requestOtp, verifyOtp } = useAuth();
  const { t } = useI18n();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState('phone');
  const [isNew, setIsNew] = useState(false);
  const [devCode, setDevCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function send(e) {
    e?.preventDefault();
    const p = clean(phone);
    if (!MOBILE_RE.test(p)) return setError(`Enter a valid 10-digit mobile number (${MOBILE_PLACEHOLDER})`);
    setError('');
    setBusy(true);
    try {
      const res = await requestOtp(p, purpose);
      setIsNew(res.isNewUser);
      setDevCode(res.devCode || null);
      setStage('code');
      setCode('');
      setCooldown(30);
      toast.success('Code sent');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e?.preventDefault();
    if (code.length !== 6) return setError('Enter the 6-digit code');
    if (purpose === 'login' && isNew && askName && name.trim().length < 2) return setError('Tell us your name');
    setError('');
    setBusy(true);
    try {
      if (purpose === 'booking') {
        await onVerified({ phone: clean(phone), code, name: name.trim(), isNew });
      } else {
        const user = await verifyOtp({ phone: clean(phone), code, name: name.trim() || undefined, referralCode: referralCode || undefined });
        await onVerified?.(user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'phone') {
    return (
      <form onSubmit={send} className="space-y-4" noValidate>
        <Field label={t('auth.phone')} error={error}>
          {(id) => (
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-steel-300 bg-steel-100 text-sm text-steel-600">+{DIAL_CODE}</span>
              <Input id={id} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel-national" placeholder={MOBILE_PLACEHOLDER} className="rounded-l-none" maxLength={14} autoFocus />
            </div>
          )}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t('auth.sendOtp')}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      <div className="text-sm text-steel-600 flex items-center gap-2">
        Code sent to <span className="font-medium text-steel-900">+{DIAL_CODE} {clean(phone)}</span>
        <button type="button" onClick={() => setStage('phone')} className="text-rust-600 inline-flex items-center gap-1 text-xs font-medium" aria-label="Change number">
          <Pencil className="w-3 h-3" aria-hidden /> Change
        </button>
      </div>
      <div>
        <div className="label">{t('auth.enterOtp')}</div>
        <OtpInput value={code} onChange={setCode} autoFocus />
        {devCode && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1 mt-2 inline-block">
            Test mode (no SMS provider): your code is <span className="font-semibold tabular">{devCode}</span>
          </p>
        )}
      </div>
      {isNew && askName && (
        <Field label={t('auth.name')}>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}</Field>
      )}
      {error && (
        <p className="text-danger-600 text-sm" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" loading={busy}>
        {submitLabel || t('auth.verify')}
      </Button>
      <button type="button" disabled={cooldown > 0 || busy} onClick={send} className="text-sm text-rust-600 disabled:text-steel-400 font-medium">
        {cooldown > 0 ? `${t('auth.resend')} (${cooldown}s)` : t('auth.resend')}
      </button>
    </form>
  );
}
