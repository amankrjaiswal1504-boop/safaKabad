import { Link } from 'react-router-dom';
import { ArrowRight, Gift, KeyRound, Leaf, Package, Plus, Trees, Wallet } from 'lucide-react';
import useApi from '../../hooks/useApi';
import usePageMeta from '../../hooks/usePageMeta';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { Button, Card, EmptyState, PageHeader, Skeleton, Stat, StatusBadge } from '../../components/ui';
import { fmtDay, rupees } from '../../utils/format';

export default function Overview() {
  const { user } = useAuth();
  const { t } = useI18n();
  usePageMeta({ title: t('dash.overview'), noindex: true });
  const { data: active, loading } = useApi('/pickups', { params: { status: 'active', limit: 3 } });
  const { data: recent } = useApi('/pickups', { params: { limit: 5 } });
  const { data: wallet } = useApi('/wallet');
  const { data: impact } = useApi('/impact');
  const next = active?.pickups?.[0];
  const tier = impact?.tier;
  const progress = tier?.next ? Math.min(100, ((impact.kg - tier.current.minKg) / (tier.next.minKg - tier.current.minKg)) * 100) : 100;

  return (
    <div>
      <PageHeader
        title={`Hi, ${user.name.split(' ')[0]} 👋`}
        subtitle="Here's what's happening with your scrap."
        actions={
          <Button to="/schedule-pickup" icon={Plus}>
            {t('nav.book')}
          </Button>
        }
      />

      {loading && !active ? (
        <Skeleton className="h-36 mb-6" />
      ) : next ? (
        <Card className="mb-6 !p-0 overflow-hidden">
          <div className="p-5 flex flex-wrap gap-4 items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-steel-500">Next pickup</span>
                <StatusBadge status={next.status} />
              </div>
              <div className="font-head text-xl font-semibold text-steel-900 mt-1">
                {fmtDay(next.scheduledDate)} · {next.timeSlot}
              </div>
              <div className="text-sm text-steel-500">
                {next.pickupId} · {next.items.map((i) => i.itemName).join(', ')}
              </div>
            </div>
            <Button variant="outline" to={`/pickups/${next.pickupId}`}>
              Track <ArrowRight className="w-4 h-4" aria-hidden />
            </Button>
          </div>
          <div className="bg-rust-50 border-t border-rust-100 px-5 py-3 text-sm text-steel-700 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-rust-600" aria-hidden /> Open the pickup to see your door code. Share it only with the collector at your door.
          </div>
        </Card>
      ) : (
        <EmptyState
          className="mb-6"
          icon={Package}
          title="No upcoming pickups"
          description="Book a free pickup and we'll come to your doorstep."
          action={
            <Button to="/schedule-pickup" icon={Plus}>
              {t('nav.book')}
            </Button>
          }
        />
      )}

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Link to="/wallet" className="block">
          <Stat label={t('dash.wallet')} value={wallet ? rupees(wallet.balance, { decimals: 0 }) : '—'} icon={Wallet} tone="patina" hint="Withdraw to eSewa, Khalti or bank" />
        </Link>
        <Link to="/impact" className="block">
          <Stat label="Recycled" value={impact ? `${impact.kg} kg` : '—'} icon={Leaf} tone="patina" hint={impact ? `${impact.co2Kg} kg CO₂ avoided` : ''} />
        </Link>
        <Link to="/referrals" className="block">
          <Stat label={t('dash.referrals')} value={user.referralCode || '—'} icon={Gift} tone="rust" hint="Share your code, both earn" />
        </Link>
      </div>

      {tier && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Trees className="w-5 h-5" aria-hidden />
              </span>
              <div>
                <div className="font-semibold text-steel-900">{tier.current.name} member</div>
                <div className="text-sm text-steel-500">
                  {tier.current.bonusPercent ? `+${tier.current.bonusPercent}% on every pickup` : 'Recycle more to unlock bonuses'}
                </div>
              </div>
            </div>
            {tier.next && (
              <div className="text-sm text-steel-600">
                {tier.kgToNext} kg to <span className="font-semibold text-steel-900">{tier.next.name}</span> (+{tier.next.bonusPercent}%)
              </div>
            )}
          </div>
          <div className="h-2 rounded-full bg-steel-100 mt-4" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next tier">
            <div className="h-2 rounded-full bg-amber-600" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      )}

      <Card padded={false}>
        <div className="flex justify-between items-center px-5 py-4 border-b border-steel-100">
          <h2 className="font-medium text-steel-900">Recent pickups</h2>
          <Link to="/pickups" className="text-sm link">
            {t('common.viewAll')}
          </Link>
        </div>
        {!recent ? (
          <Skeleton className="h-32 m-5" />
        ) : !recent.pickups.length ? (
          <p className="px-5 py-8 text-sm text-steel-500 text-center">Your pickups will show up here.</p>
        ) : (
          <ul className="divide-y divide-steel-100">
            {recent.pickups.map((p) => (
              <li key={p._id}>
                <Link to={`/pickups/${p.pickupId}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-steel-50">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-steel-900">{p.pickupId}</div>
                    <div className="text-xs text-steel-500 truncate">
                      {fmtDay(p.scheduledDate)} · {p.items.map((i) => i.itemName).join(', ')}
                    </div>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={p.status} />
                    <div className="text-xs text-steel-500 mt-1 tabular">
                      {p.finalAmount != null ? rupees((p.finalAmount || 0) + (p.bonusAmount || 0)) : `${rupees(p.estimatedValueMin)}–${rupees(p.estimatedValueMax)}`}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
