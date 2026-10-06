import { useState } from 'react';
import toast from 'react-hot-toast';
import { BellRing, Building2, KeyRound, Monitor, Moon, Sun, User } from 'lucide-react';
import api from '../../services/api';
import usePageMeta from '../../hooks/usePageMeta';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useI18n } from '../../i18n/I18nContext';
import { LANGUAGES } from '../../i18n/messages';
import { Button, Card, Field, Input, PageHeader, Segmented, Select, SectionTitle, Toggle } from '../../components/ui';
import { useConfig } from '../../context/ConfigContext';

const urlBase64ToUint8Array = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export default function Profile() {
  const { user, setUser } = useAuth();
  const { mode, setMode } = useTheme();
  const { lang, setLang } = useI18n();
  const { config } = useConfig();
  usePageMeta({ title: 'Profile & settings', noindex: true });
  const [form, setForm] = useState({ name: user.name, email: user.email || '' });
  const [prefs, setPrefs] = useState({ email: true, whatsapp: true, sms: false, push: true, ...user.notificationPrefs });
  const [biz, setBiz] = useState({ companyName: '', businessType: 'office', panVat: '', billingAddress: '', ...user.business });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState('');

  async function save(section, body) {
    setBusy(section);
    try {
      const res = await api.put('/users/profile', body);
      setUser(res.data.data.user);
      toast.success('Saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (pw.newPassword.length < 8) return toast.error('New password needs at least 8 characters');
    setBusy('pw');
    try {
      await api.post('/auth/change-password', pw);
      toast.success('Password updated. Other devices were signed out.');
      setPw({ currentPassword: '', newPassword: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  }

  async function enablePush() {
    const key = config?.features?.vapidPublicKey;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast.error('Push notifications are not supported in this browser');
    if (!key) return toast('Push is not configured on this server yet. You will still get in-app, email and WhatsApp updates.');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return toast.error('Permission denied');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      await api.post('/users/push/subscribe', { subscription: sub.toJSON() });
      toast.success('Push notifications enabled on this device');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profile & settings" />

      <Card>
        <SectionTitle title={<span className="flex items-center gap-2"><User className="w-4 h-4" aria-hidden /> Personal details</span>} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Email" hint="Used for receipts and password resets">
            {(id) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
          </Field>
          <Field label="Mobile" hint="Contact support to change your number">
            {(id) => <Input id={id} value={user.phone} disabled />}
          </Field>
          <Field label="Referral code">{(id) => <Input id={id} value={user.referralCode || ''} disabled />}</Field>
        </div>
        <Button className="mt-4" loading={busy === 'me'} onClick={() => save('me', { name: form.name, email: form.email })}>
          Save details
        </Button>
      </Card>

      <Card>
        <SectionTitle title={<span className="flex items-center gap-2"><BellRing className="w-4 h-4" aria-hidden /> Notifications</span>} subtitle="Pickup updates always appear in the app." />
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            ['whatsapp', 'WhatsApp', 'Booking, collector and payment updates'],
            ['email', 'Email', 'Receipts and important updates'],
            ['sms', 'SMS', 'Text messages for key updates'],
            ['push', 'Push', 'Browser / phone notifications'],
          ].map(([k, l, d]) => (
            <Toggle key={k} checked={prefs[k]} onChange={(v) => setPrefs({ ...prefs, [k]: v })} label={l} description={d} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button loading={busy === 'prefs'} onClick={() => save('prefs', { notificationPrefs: prefs })}>
            Save preferences
          </Button>
          <Button variant="outline" onClick={enablePush}>
            Enable push on this device
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Appearance & language" />
        <div className="flex flex-wrap gap-6">
          <div>
            <div className="label">Theme</div>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }, { value: 'system', label: 'System', icon: Monitor }]} />
          </div>
          <div>
            <div className="label">Language</div>
            <Segmented
              value={lang}
              onChange={(v) => {
                setLang(v);
                api.put('/users/profile', { language: v }).catch(() => {});
              }}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            />
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle title={<span className="flex items-center gap-2"><Building2 className="w-4 h-4" aria-hidden /> Business account</span>} subtitle="Get your PAN/VAT number on bills and volume pricing tiers." />
        <Toggle
          checked={user.accountType === 'business'}
          onChange={(v) => save('type', { accountType: v ? 'business' : 'individual' })}
          label="This is a business account"
          description={user.accountType === 'business' ? `Pricing tier: ${user.business?.pricingTier || 'standard'}` : 'Shops, offices, societies and factories'}
        />
        {user.accountType === 'business' && (
          <>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <Field label="Business name">{(id) => <Input id={id} value={biz.companyName || ''} onChange={(e) => setBiz({ ...biz, companyName: e.target.value })} />}</Field>
              <Field label="Type">
                {(id) => (
                  <Select id={id} value={biz.businessType || 'office'} onChange={(e) => setBiz({ ...biz, businessType: e.target.value })}>
                    <option value="kirana">Kirana / retail</option>
                    <option value="office">Office</option>
                    <option value="society">Housing society</option>
                    <option value="factory">Factory / warehouse</option>
                    <option value="other">Other</option>
                  </Select>
                )}
              </Field>
              <Field label="PAN/VAT no." hint="9 digits">{(id) => <Input id={id} inputMode="numeric" value={biz.panVat || ''} maxLength={9} onChange={(e) => setBiz({ ...biz, panVat: e.target.value.replace(/\D/g, '') })} />}</Field>
              <Field label="Billing address">{(id) => <Input id={id} value={biz.billingAddress || ''} onChange={(e) => setBiz({ ...biz, billingAddress: e.target.value })} />}</Field>
            </div>
            <Button className="mt-4" loading={busy === 'biz'} onClick={() => save('biz', { business: { companyName: biz.companyName, businessType: biz.businessType, panVat: biz.panVat, billingAddress: biz.billingAddress } })}>
              Save business details
            </Button>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle title={<span className="flex items-center gap-2"><KeyRound className="w-4 h-4" aria-hidden /> Password</span>} subtitle="Phone-only accounts can set a password here to also log in with email." />
        <form onSubmit={changePassword} className="grid sm:grid-cols-2 gap-4">
          <Field label="Current password">{(id) => <Input id={id} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}</Field>
          <Field label="New password" hint="At least 8 characters">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}</Field>
          <div>
            <Button type="submit" loading={busy === 'pw'}>
              Update password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
