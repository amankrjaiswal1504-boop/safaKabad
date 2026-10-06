import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth, homePathFor } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import usePageMeta from '../hooks/usePageMeta';
import AuthShell from '../components/AuthShell';
import { Button, Field, Input } from '../components/ui';
import { MOBILE_PLACEHOLDER, isMobile } from '../utils/locale';

export default function Register() {
  const { register, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', referralCode: params.get('ref') || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  usePageMeta({ title: t('auth.registerTitle'), noindex: true });

  if (user) return <Navigate to={homePathFor(user)} replace />;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function validate() {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter your name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (!isMobile(form.phone)) e.phone = `Enter a valid 10-digit mobile number (${MOBILE_PLACEHOLDER})`;
    if (form.password.length < 8) e.password = 'At least 8 characters';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const u = await register({ ...form, referralCode: form.referralCode || undefined });
      toast.success('Account created');
      navigate(location.state?.from || homePathFor(u), { replace: true });
    } catch (err) {
      if (err.errors) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])));
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={t('auth.registerTitle')}
      subtitle="Or skip this: you can book with just your phone number."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="link">
            {t('nav.login')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('auth.name')} error={errors.name} required>
          {(id) => <Input id={id} autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />}
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t('auth.email')} error={errors.email} required>
            {(id) => <Input id={id} type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} />}
          </Field>
          <Field label={t('auth.phone')} error={errors.phone} required>
            {(id) => <Input id={id} inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} invalid={!!errors.phone} />}
          </Field>
        </div>
        <Field label={t('auth.password')} error={errors.password} hint="At least 8 characters" required>
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} invalid={!!errors.password} />}
        </Field>
        <Field label={t('auth.referral')} error={errors.referralCode}>
          {(id) => <Input id={id} value={form.referralCode} onChange={(e) => set('referralCode', e.target.value.toUpperCase())} />}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t('auth.createAccount')}
        </Button>
        <p className="text-xs text-steel-500">
          By continuing you agree to our{' '}
          <Link to="/terms" className="link">
            terms & privacy
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}
