import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileDown, Printer } from 'lucide-react';
import useApi from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { download } from '../services/api';
import { LogoMark } from '../components/Logo';
import { Button, ErrorState, Skeleton } from '../components/ui';
import { addressLine, fmtDate, rupees, unitLabel } from '../utils/format';
import { payoutLabel } from '../utils/locale';

export default function Receipt() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/pickups/${id}`);
  usePageMeta({ title: `Receipt ${id}`, noindex: true });
  const p = data?.pickup;

  if (error) return <div className="container-page py-12 max-w-2xl"><ErrorState error={error} onRetry={reload} /></div>;
  if (loading && !p) return <div className="container-page py-12 max-w-2xl"><Skeleton className="h-[32rem]" /></div>;
  const total = (p.finalAmount || 0) + (p.bonusAmount || 0);

  return (
    <div className="container-page py-10 max-w-2xl">
      <div className="bg-surface border border-steel-100 rounded-2xl shadow-card overflow-hidden print:shadow-none print:border-0">
        <div className="bg-ink text-white px-6 sm:px-8 py-6 flex justify-between items-start gap-4 print:bg-white print:text-black">
          <div className="flex items-center gap-3">
            <LogoMark className="w-10 h-10" />
            <div>
              <div className="font-head font-bold text-lg">SafaKabad</div>
              <div className="text-xs opacity-70">{p.type === 'donation' ? 'Donation receipt' : 'Payment receipt'}</div>
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">{p.pickupId}</div>
            <div className="opacity-70">{fmtDate(p.completedAt || p.scheduledDate)}</div>
          </div>
        </div>
        <div className="px-6 sm:px-8 py-6">
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm mb-6">
            <div>
              <dt className="text-steel-500">Customer</dt>
              <dd className="text-steel-900">{p.customer?.name}</dd>
            </div>
            <div>
              <dt className="text-steel-500">Collector</dt>
              <dd className="text-steel-900">{p.collector?.name || '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-steel-500">Address</dt>
              <dd className="text-steel-900">{addressLine(p.addressSnapshot)}</dd>
            </div>
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-steel-500 border-b border-steel-200">
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 font-medium">Weight</th>
                  <th className="py-2 font-medium">Rate</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {p.items.map((it) => (
                  <tr key={it.itemName} className="border-b border-steel-100 align-top">
                    <td className="py-3">
                      <div className="text-steel-900">{it.itemName}</div>
                      {it.weighingPhoto && (
                        <a href={it.weighingPhoto} target="_blank" rel="noopener noreferrer" className="text-xs link print:hidden">
                          Scale photo
                        </a>
                      )}
                    </td>
                    <td className="py-3 tabular">{it.actualWeight != null ? `${it.actualWeight} ${unitLabel(it.unit)}` : '—'}</td>
                    <td className="py-3 tabular">{it.rateApplied != null ? rupees(it.rateApplied, { decimals: 2 }) : '—'}</td>
                    <td className="py-3 text-right tabular">{it.subtotal != null ? rupees(it.subtotal, { decimals: 2 }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.type !== 'donation' && (
            <div className="mt-4 ml-auto max-w-xs text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-steel-500">Subtotal</span>
                <span className="tabular">{rupees(p.finalAmount, { decimals: 2 })}</span>
              </div>
              {p.bonusAmount > 0 && (
                <div className="flex justify-between text-patina-700">
                  <span>Bonus{p.coupon?.code ? ` (${p.coupon.code})` : ''}</span>
                  <span className="tabular">+{rupees(p.bonusAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-head font-semibold text-lg border-t border-steel-200 pt-2">
                <span>Total paid</span>
                <span className="tabular">{rupees(total, { decimals: 2 })}</span>
              </div>
              {p.payout?.method && <div className="text-xs text-steel-500 text-right">via {payoutLabel(p.payout.method)}</div>}
            </div>
          )}
          <p className="text-xs text-steel-500 text-center border-t border-steel-100 pt-4 mt-6">
            Weights were recorded on a digital scale at your doorstep. Thank you for recycling with SafaKabad.
          </p>
        </div>
      </div>
      <div className="flex gap-3 mt-4 print:hidden">
        <Button variant="outline" icon={Printer} className="flex-1" onClick={() => window.print()}>
          Print
        </Button>
        <Button icon={FileDown} className="flex-1" onClick={() => download(`/pickups/${id}/receipt.pdf`, `SafaKabad-${id}.pdf`).catch((e) => toast.error(e.message))}>
          Download PDF
        </Button>
      </div>
    </div>
  );
}
