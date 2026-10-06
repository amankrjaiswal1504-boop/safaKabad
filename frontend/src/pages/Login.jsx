import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, Smartphone } from 'lucide-react';
import { useAuth, homePathFor } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import usePageMeta from '../hooks/usePageMeta';
import AuthShell from '../components/AuthShell';
import PhoneOtpForm from '../components/PhoneOtpForm';
import { Button, Field, Input, Segmented } from '../components/ui';

export default function Login() {
  const { login, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('phone');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  usePageMeta({ title: t('nav.login'), noindex: true });

  const go = (u) => {
    toast.success(`Welcome, ${u.name.split(' ')[0]}`);
    navigate(location.state?.from || homePathFor(u), { replace: true });
  };

  if (user) return <Navigate to={location.state?.from || homePathFor(user)} replace />;

  async function submit(e) {
    e.preventDefault();
    if (!form.email || !form.password) return setError('Enter your email and password');
    setBusy(true);
    setError('');
    try {
      go(await login(form.email, form.password));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSub')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register" state={location.state} className="link">
            {t('auth.createAccount')}
          </Link>
          {import.meta.env.DEV && (
          <details className="mt-6 text-xs">
            <summary className="cursor-pointer text-steel-400">Demo accounts (development)</summary>
            <div className="mt-2 grid gap-1 text-steel-500">
              <span>Customer: customer@scrapmate.dev / Customer@123 (or phone 9800000003)</span>
              <span>Business: business@scrapmate.dev / Business@123</span>
              <span>Collector: collector1@scrapmate.dev / Collector@123</span>
              <span>Admin: admin@scrapmate.dev / Admin@123</span>
              <span>Staff: support@ / ops@ / finance@scrapmate.dev / Staff@123</span>
            </div>
          </details>
          )}
        </>
      }
    >
      <Segmented
        className="w-full mb-6 [&>button]:flex-1 [&>button]:justify-center"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setError('');
        }}
        options={[
          { value: 'phone', label: t('auth.withPhone'), icon: Smartphone },
          { value: 'email', label: t('auth.withEmail'), icon: Mail },
        ]}
      />
      {mode === 'phone' ? (
        <PhoneOtpForm onVerified={go} />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label={t('auth.email')}>
            {(id) => <Input id={id} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus />}
          </Field>
          <Field label={t('auth.password')}>
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
          </Field>
          <div className="flex justify-end -mt-2">
            <Link to="/forgot-password" className="text-sm link">
              {t('auth.forgot')}
            </Link>
          </div>
          {error && (
            <p className="text-danger-600 text-sm" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            {t('nav.login')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
