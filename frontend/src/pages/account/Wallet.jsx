import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDownLeft, ArrowUpRight, Banknote, Wallet as WalletIcon } from 'lucide-react';
import api from '../../services/api';
import useApi from '../../hooks/useApi';
import usePageMeta from '../../hooks/usePageMeta';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Segmented, SkeletonRows, cx } from '../../components/ui';
import { fmtDateTime, rupees } from '../../utils/format';
import { MOBILE_PLACEHOLDER, payoutLabel } from '../../utils/locale';

const REASONS = { pickup_payout: 'Pickup payout', referral: 'Referral reward', withdrawal: 'Withdrawal', refund: 'Refund', bonus: 'Bonus' };
const W_TONE = { requested: 'amber', processing: 'blue', paid: 'patina', rejected: 'danger' };

export default function Wallet() {
  usePageMeta({ title: 'Wallet', noindex: true });
  const { data, error, loading, reload } = useApi('/wallet');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: '', method: 'esewa', walletId: '', accountNumber: '', bankName: '', branch: '', holderName: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function withdraw() {
    setBusy(true);
    try {
      await api.post('/wallet/withdraw', {
        amount: Number(form.amount),
        method: form.method,
        ...(form.method === 'bank_transfer'
          ? { bankAccount: { accountNumber: form.accountNumber, bankName: form.bankName, branch: form.branch || undefined, holderName: form.holderName } }
          : { walletId: form.walletId }),
      });
      toast.success('Withdrawal requested. Usually processed within a day.');
      setOpen(false);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState error={error} onRetry={reload} />;
  const pending = data?.withdrawals?.find((w) => ['requested', 'processing'].includes(w.status));

  return (
    <div>
      <PageHeader title="Wallet" subtitle="Choose 'Wallet' at pickup to collect earnings here, then withdraw any time." />
      <Card className="mb-6 bg-ink text-white border-0 !p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-[#A3B3AC] flex items-center gap-2">
              <WalletIcon className="w-4 h-4" aria-hidden /> Available balance
            </div>
            <div className="font-head text-4xl sm:text-5xl font-bold mt-1 tabular">{data ? rupees(data.balance, { decimals: 2 }) : '—'}</div>
            {pending && <div className="text-sm text-[#D9B66A] mt-1">{rupees(pending.amount)} withdrawal {pending.status}</div>}
          </div>
          <Button icon={Banknote} onClick={() => setOpen(true)} disabled={!data || data.balance < 50 || Boolean(pending)}>
            Withdraw
          </Button>
        </div>
        {data && data.balance < 50 && <p className="text-xs text-[#A3B3AC] mt-3">Minimum withdrawal is Rs. 50.</p>}
      </Card>

      <h2 className="font-medium text-steel-900 mb-3">Transactions</h2>
      {loading && !data ? (
        <SkeletonRows rows={4} />
      ) : !data.transactions.length ? (
        <EmptyState icon={WalletIcon} title="No transactions yet" description="Choose wallet payout when your collector completes a pickup." />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-steel-100">
            {data.transactions.map((tx) => (
              <li key={tx._id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={cx('w-9 h-9 rounded-full flex items-center justify-center', tx.type === 'credit' ? 'bg-patina-100 text-patina-700' : 'bg-steel-100 text-steel-600')}>
                  {tx.type === 'credit' ? <ArrowDownLeft className="w-4 h-4" aria-hidden /> : <ArrowUpRight className="w-4 h-4" aria-hidden />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-steel-900">{REASONS[tx.reason] || tx.reason}</div>
                  <div className="text-xs text-steel-500 truncate">
                    {fmtDateTime(tx.createdAt)}
                    {tx.reference && /^SM-/.test(tx.reference) ? ` · ${tx.reference}` : ''}
                    {tx.note ? ` · ${tx.note}` : ''}
                  </div>
                </div>
                <div className={cx('font-semibold tabular', tx.type === 'credit' ? 'text-patina-700' : 'text-steel-900')}>
                  {tx.type === 'credit' ? '+' : '−'}
                  {rupees(tx.amount, { decimals: 2 })}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data?.withdrawals?.length > 0 && (
        <>
          <h2 className="font-medium text-steel-900 mb-3 mt-8">Withdrawals</h2>
          <Card padded={false}>
            <ul className="divide-y divide-steel-100">
              {data.withdrawals.map((w) => (
                <li key={w._id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span>
                    {rupees(w.amount)} to {w.method === 'bank_transfer' ? `${w.bankAccount?.bankName || 'bank'} ••${w.bankAccount?.accountNumber?.slice(-4)}` : `${payoutLabel(w.method)} ${w.walletId || ''}`}
                    <span className="block text-xs text-steel-500">{fmtDateTime(w.createdAt)}</span>
                  </span>
                  <Badge tone={W_TONE[w.status]}>{w.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Withdraw money"
        footer={
          <Button loading={busy} onClick={withdraw} disabled={!(Number(form.amount) >= 50)}>
            Request withdrawal
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Amount" hint={data ? `Available ${rupees(data.balance, { decimals: 2 })}` : ''}>
            {(id) => <Input id={id} type="number" min="50" max={data?.balance} value={form.amount} onChange={(e) => set('amount', e.target.value)} />}
          </Field>
          <Segmented value={form.method} onChange={(v) => set('method', v)} options={[{ value: 'esewa', label: 'eSewa' }, { value: 'khalti', label: 'Khalti' }, { value: 'bank_transfer', label: 'Bank account' }]} />
          {form.method !== 'bank_transfer' ? (
            <Field label={`${payoutLabel(form.method)} ID (mobile number)`}>
              {(id) => <Input id={id} inputMode="tel" placeholder={MOBILE_PLACEHOLDER} value={form.walletId} onChange={(e) => set('walletId', e.target.value.trim())} />}
            </Field>
          ) : (
            <div className="grid gap-3">
              <Field label="Account holder name">{(id) => <Input id={id} value={form.holderName} onChange={(e) => set('holderName', e.target.value)} />}</Field>
              <Field label="Account number">{(id) => <Input id={id} inputMode="numeric" value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value.replace(/\D/g, ''))} />}</Field>
              <Field label="Bank name">{(id) => <Input id={id} placeholder="e.g. Nabil Bank" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />}</Field>
              <Field label="Branch">{(id) => <Input id={id} value={form.branch} onChange={(e) => set('branch', e.target.value)} />}</Field>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
