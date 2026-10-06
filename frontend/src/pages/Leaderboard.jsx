import { Link } from 'react-router-dom';
import { Gift, Trophy } from 'lucide-react';
import useApi from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { useConfig } from '../context/ConfigContext';
import { Card, EmptyState, PageHeader, SkeletonRows, cx } from '../components/ui';
import { rupees } from '../utils/format';

export default function Leaderboard() {
  const { data, loading } = useApi('/public/leaderboard');
  const { config } = useConfig();
  const reward = config?.referral?.referrerReward;
  usePageMeta({ title: 'Referral leaderboard', description: 'Top ScrapMate referrers this season. Invite friends and both of you earn wallet rewards.' });
  return (
    <div className="container-page py-10 max-w-3xl">
      <PageHeader title="Referral leaderboard" subtitle={reward ? `Invite friends with your code. When they finish their first pickup, you both get ${rupees(reward)} in your wallet.` : 'Invite friends with your code and earn wallet rewards.'} />
      {loading && !data ? (
        <SkeletonRows rows={5} />
      ) : !data?.leaders?.length ? (
        <EmptyState icon={Trophy} title="No referrals yet" description="Be the first on the board." action={<Link to="/referrals" className="btn-primary">Get my code</Link>} />
      ) : (
        <Card padded={false}>
          <ol className="divide-y divide-steel-100">
            {data.leaders.map((l) => (
              <li key={l.rank} className="flex items-center gap-4 px-5 py-4">
                <span
                  className={cx(
                    'w-9 h-9 rounded-full flex items-center justify-center font-head font-bold',
                    l.rank === 1 ? 'bg-amber-100 text-amber-700' : l.rank <= 3 ? 'bg-rust-100 text-rust-700' : 'bg-steel-100 text-steel-600'
                  )}
                >
                  {l.rank}
                </span>
                <span className="flex-1 font-medium text-steel-900">{l.name}</span>
                <span className="text-sm text-steel-600 tabular">
                  {l.referrals} {l.referrals === 1 ? 'friend' : 'friends'}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <div className="mt-8 text-center">
        <Link to="/referrals" className="btn-primary">
          <Gift className="w-4 h-4" aria-hidden /> Invite friends
        </Link>
      </div>
    </div>
  );
}
