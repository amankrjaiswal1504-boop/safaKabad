import { useRef } from 'react';
import toast from 'react-hot-toast';
import { Award, Download, Leaf, Lock, Package, Share2, Trees, Zap } from 'lucide-react';
import useApi from '../../hooks/useApi';
import usePageMeta from '../../hooks/usePageMeta';
import { useAuth } from '../../context/AuthContext';
import { Button, Card, ErrorState, PageHeader, Skeleton, Stat, cx } from '../../components/ui';
import { LogoMark } from '../../components/Logo';

// Draws the impact card on a canvas so it can be shared as an image.
function drawCard(canvas, { name, kg, co2, trees, tier }) {
  const ctx = canvas.getContext('2d');
  const W = 1080;
  const H = 1080;
  canvas.width = W;
  canvas.height = H;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0E1F1A');
  g.addColorStop(1, '#325A2D');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#168045';
  ctx.beginPath();
  ctx.roundRect(80, 80, 90, 90, 22);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '700 44px "Space Grotesk", sans-serif';
  ctx.fillText('SafaKabad', 195, 140);
  ctx.font = '500 40px Inter, sans-serif';
  ctx.fillStyle = '#C7D2CD';
  ctx.fillText(`${name}'s recycling impact`, 80, 300);
  const stat = (y, value, label) => {
    ctx.fillStyle = '#fff';
    ctx.font = '700 120px "Space Grotesk", sans-serif';
    ctx.fillText(value, 80, y);
    ctx.fillStyle = '#C7D2CD';
    ctx.font = '500 38px Inter, sans-serif';
    ctx.fillText(label, 80, y + 55);
  };
  stat(470, `${kg} kg`, 'of scrap recycled');
  stat(680, `${co2} kg`, 'of CO₂ emissions avoided');
  stat(890, `${trees}`, 'trees’ worth of yearly CO₂ absorption');
  ctx.fillStyle = '#D9B66A';
  ctx.font = '600 36px Inter, sans-serif';
  ctx.fillText(`${tier} member · safakabad`, 80, 1010);
}

export default function Impact() {
  const { user } = useAuth();
  usePageMeta({ title: 'Eco impact', noindex: true });
  const { data, error, loading, reload } = useApi('/impact');
  const canvas = useRef(null);

  async function share(downloadOnly) {
    drawCard(canvas.current, { name: user.name.split(' ')[0], kg: data.kg, co2: data.co2Kg, trees: data.trees, tier: data.tier.current.name });
    const blob = await new Promise((r) => canvas.current.toBlob(r, 'image/png'));
    const file = new File([blob], 'safakabad-impact.png', { type: 'image/png' });
    if (!downloadOnly && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My recycling impact', text: `I've recycled ${data.kg} kg with SafaKabad!` });
        return;
      } catch {
        /* user cancelled */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'safakabad-impact.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Impact card downloaded');
  }

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton className="h-96" />;

  return (
    <div>
      <PageHeader title="Your eco impact" subtitle="Calculated from the actual weights of your completed pickups." />
      <div className="rounded-2xl p-6 sm:p-8 mb-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgb(var(--ink)), #325A2D)' }}>
        <div className="flex items-center gap-3">
          <LogoMark className="w-8 h-8" />
          <span className="text-sm text-white/85">{user.name.split(' ')[0]}'s recycling impact</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 mt-6">
          {[
            [`${data.kg} kg`, 'scrap recycled'],
            [`${data.co2Kg} kg`, 'CO₂ avoided'],
            [`${data.trees}`, 'trees’ yearly CO₂'],
          ].map(([v, l]) => (
            <div key={l}>
              <div className="font-head text-4xl font-bold tabular">{v}</div>
              <div className="text-sm text-white/85">{l}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-6">
          <Button icon={Share2} onClick={() => share(false)} disabled={!data.pickups}>
            Share impact card
          </Button>
          <Button variant="outline" icon={Download} className="!bg-transparent !text-white !border-white/30 hover:!bg-white/10" onClick={() => share(true)} disabled={!data.pickups}>
            Download
          </Button>
        </div>
        <canvas ref={canvas} className="hidden" aria-hidden />
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat label="Completed pickups" value={data.pickups} icon={Package} />
        <Stat label="Membership tier" value={data.tier.current.name} icon={Award} tone="amber" hint={data.tier.next ? `${data.tier.kgToNext} kg to ${data.tier.next.name}` : 'Top tier reached'} />
        <Stat label="Tier bonus" value={`+${data.tier.current.bonusPercent || 0}%`} icon={Zap} tone="patina" hint="Added to every payout" />
      </div>

      <Card>
        <h2 className="font-medium text-steel-900 mb-4">Badges</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.badges.map((b) => (
            <li key={b.id} className={cx('rounded-xl border p-4 text-center', b.earned ? 'border-patina-200 bg-patina-50' : 'border-steel-100 bg-surface-2 opacity-60')}>
              <span className={cx('w-11 h-11 mx-auto rounded-full flex items-center justify-center', b.earned ? 'bg-patina-600 text-white' : 'bg-steel-200 text-steel-500')}>
                {b.earned ? b.id.includes('tree') ? <Trees className="w-5 h-5" aria-hidden /> : <Leaf className="w-5 h-5" aria-hidden /> : <Lock className="w-4 h-4" aria-hidden />}
              </span>
              <div className="text-sm font-medium text-steel-900 mt-2">{b.label}</div>
              <div className="text-xs text-steel-500">{b.earned ? 'Earned' : 'Locked'}</div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-steel-500 mt-4">CO₂ figures are estimates based on typical savings from recycling each material instead of producing it new.</p>
      </Card>
    </div>
  );
}
