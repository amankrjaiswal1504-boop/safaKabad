import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, Gift, MessageCircle, Share2, Trophy, UserPlus } from 'lucide-react';
import useApi from '../../hooks/useApi';
import usePageMeta from '../../hooks/usePageMeta';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui';
import { fmtDate, rupees } from '../../utils/format';

export default function Referrals() {
  usePageMeta({ title: 'Refer & earn', noindex: true });
  const { data, error, loading, reload } = useApi('/referrals');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton className="h-80" />;
  const link = `${window.location.origin}/register?ref=${data.code}`;
  const message = `I sell my scrap with SafaKabad: free doorstep pickup and instant payment. Sign up with my code ${data.code} and we both get ${rupees(data.rewards.referee)}: ${link}`;

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  }

  return (
    <div>
      <PageHeader title="Refer & earn" subtitle={`Your friend gets ${rupees(data.rewards.referee)} and you get ${rupees(data.rewards.referrer)} after their first completed pickup.`} actions={<Button variant="outline" icon={Trophy} to="/referrals/leaderboard">Leaderboard</Button>} />
      <Card className="mb-6 !p-6 bg-rust-50 border-rust-100">
        <div className="text-sm text-steel-600">Your referral code</div>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <span className="font-head text-3xl font-bold tracking-wider text-steel-900">{data.code}</span>
          <Button variant="outline" size="sm" icon={Copy} onClick={() => copy(data.code)}>
            Copy
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          <Button icon={MessageCircle} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            Share on WhatsApp
          </Button>
          <Button
            variant="outline"
            icon={Share2}
            onClick={() => (navigator.share ? navigator.share({ title: 'SafaKabad', text: message, url: link }).catch(() => {}) : copy(message))}
          >
            Share link
          </Button>
        </div>
      </Card>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {[
          ['1', 'Share your code', 'Send it to friends, family or neighbours.'],
          ['2', 'They book a pickup', 'They sign up with your code and complete their first pickup.'],
          ['3', 'You both get paid', 'Rewards land in both wallets automatically.'],
        ].map(([n, h, d]) => (
          <Card key={n}>
            <span className="w-8 h-8 rounded-full bg-rust-600 text-white text-sm font-semibold flex items-center justify-center">{n}</span>
            <h2 className="font-semibold text-steel-900 mt-3">{h}</h2>
            <p className="text-sm text-steel-500 mt-1">{d}</p>
          </Card>
        ))}
      </div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-steel-900">Friends who joined</h2>
        <span className="text-sm text-steel-600">
          Earned so far: <span className="font-semibold text-patina-700">{rupees(data.earned)}</span>
        </span>
      </div>
      {!data.referred.length ? (
        <EmptyState icon={UserPlus} title="No referrals yet" description="Your friends will appear here once they sign up with your code." />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-steel-100">
            {data.referred.map((r, i) => (
              <li key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-medium text-steel-900">{r.name}</span>
                  <span className="text-steel-500"> · joined {fmtDate(r.joinedAt)}</span>
                </span>
                {r.rewarded ? <Badge tone="patina">Rewarded</Badge> : <Badge>Waiting for first pickup</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-steel-500 mt-4 flex items-center gap-1.5">
        <Gift className="w-3.5 h-3.5" aria-hidden /> Rewards are credited once per friend. <Link to="/terms" className="link">Terms</Link>
      </p>
    </div>
  );
}
