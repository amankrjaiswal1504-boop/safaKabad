import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, Check, HeartHandshake, KeyRound, PartyPopper, Truck, UserCheck, Wallet } from 'lucide-react';
import { Button } from './ui';
import { fmtDay, rupees } from '../utils/format';

const CONFETTI_COLORS = ['#34d399', '#10b981', '#fbbf24', '#f97316', '#fb7185', '#60a5fa', '#a78bfa', '#facc15'];

// A one-off burst of CSS confetti; pieces fall once and the layer removes itself.
function Confetti({ count = 90 }) {
  const [show, setShow] = useState(true);
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        w: 6 + Math.random() * 7,
        h: 8 + Math.random() * 10,
        round: Math.random() > 0.7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        dx: `${(Math.random() - 0.5) * 220}px`,
        rx: `${360 + Math.random() * 720}deg`,
        rz: `${(Math.random() - 0.5) * 720}deg`,
        dur: `${2.6 + Math.random() * 2}s`,
        delay: `${Math.random() * 0.7}s`,
      })),
    [count]
  );
  useEffect(() => {
    const id = setTimeout(() => setShow(false), 5500);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.round ? p.w : p.h,
            borderRadius: p.round ? '50%' : 2,
            background: p.color,
            '--dx': p.dx,
            '--rx': p.rx,
            '--rz': p.rz,
            '--dur': p.dur,
            '--delay': p.delay,
          }}
        />
      ))}
    </div>
  );
}

// Card that leans toward the pointer in 3D.
function Tilt({ children, className = '' }) {
  const ref = useRef(null);
  function move(e) {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ty', `${x * 10}deg`);
    el.style.setProperty('--tx', `${-y * 10}deg`);
  }
  function leave() {
    ref.current?.style.setProperty('--tx', '0deg');
    ref.current?.style.setProperty('--ty', '0deg');
  }
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={`tilt-3d ${className}`}>
      {children}
    </div>
  );
}

const NEXT = [
  { icon: UserCheck, title: 'Collector assigned', text: 'A verified collector is matched to your slot.', tone: 'from-emerald-400 to-teal-600' },
  { icon: Truck, title: 'At your door', text: 'Share your door code to start weighing.', tone: 'from-yellow-400 to-orange-500' },
  { icon: Wallet, title: 'Get paid', text: 'Paid instantly once the scrap is weighed.', tone: 'from-sky-400 to-indigo-600' },
];

export default function BookingSuccess({ booked, t, onTrack, onCalendar }) {
  const donation = booked.type === 'donation';
  return (
    <div className="relative overflow-hidden">
      <Confetti />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[42rem] h-[42rem] rounded-full bg-gradient-to-br from-emerald-300/30 via-yellow-200/20 to-rose-300/20 blur-3xl anim-blob dark:from-emerald-500/20 dark:via-yellow-500/10 dark:to-rose-500/10" aria-hidden />

      <div className="container-page relative py-12 sm:py-16 max-w-xl text-center">
        {/* 3D medallion */}
        <div className="relative mx-auto w-28 h-28 [perspective:800px]">
          <span className="absolute inset-0 rounded-full border-4 border-emerald-400/60 anim-ring" aria-hidden />
          <span className="absolute inset-0 rounded-full border-4 border-yellow-400/50 anim-ring [animation-delay:0.7s]" aria-hidden />
          <div className="anim-pop-3d w-full h-full">
            <div className="anim-spin-3d w-full h-full rounded-full bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-700 shadow-[0_20px_40px_-12px_rgb(16_185_129/0.6),inset_0_-8px_16px_rgb(0_0_0/0.25),inset_0_6px_12px_rgb(255_255_255/0.4)] flex items-center justify-center">
              <Check className="w-14 h-14 text-white drop-shadow-[0_3px_0_rgb(0_0_0/0.2)]" strokeWidth={3.5} aria-hidden />
            </div>
          </div>
          <PartyPopper className="absolute -right-8 -top-2 w-8 h-8 text-orange-500 anim-float [--r:15deg]" aria-hidden />
          <PartyPopper className="absolute -left-8 top-6 w-7 h-7 text-rose-500 anim-float [--r:-70deg] [animation-delay:-2s]" aria-hidden />
        </div>

        <h1 className="anim-rise [animation-delay:250ms] font-head text-4xl sm:text-5xl font-bold mt-8">
          <span className="text-gradient-energy">{t('book.successTitle')}</span>
        </h1>
        <p className="anim-rise [animation-delay:350ms] text-steel-600 mt-3">{t('book.successSub')}</p>

        {/* Ticket */}
        <Tilt className="mt-8">
          <div className="anim-ticket text-left rounded-3xl bg-surface border border-steel-200/70 shadow-lift overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-700 text-white px-6 py-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/75">Pickup ID</div>
                <div className="font-head text-xl font-bold tabular">{booked.pickupId}</div>
              </div>
              <Truck className="w-9 h-9 text-white/90 anim-float" aria-hidden />
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-steel-500">When</div>
                <div className="font-semibold text-steel-900 mt-0.5">{fmtDay(booked.scheduledDate)}</div>
                <div className="text-sm text-steel-600">{booked.timeSlot}</div>
              </div>
              {!donation && (
                <div className="text-right">
                  <div className="text-xs text-steel-500">Estimate</div>
                  <div className="font-head text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular mt-0.5">
                    <span className="whitespace-nowrap">{rupees(booked.estimatedValueMin)}</span> – <span className="whitespace-nowrap">{rupees(booked.estimatedValueMax)}</span>
                  </div>
                </div>
              )}
            </div>
            {booked.otp && (
              <>
                {/* Perforation */}
                <div className="relative flex items-center" aria-hidden>
                  <span className="absolute -left-3 w-6 h-6 rounded-full bg-steel-50" />
                  <span className="flex-1 mx-5 border-t-2 border-dashed border-steel-200" />
                  <span className="absolute -right-3 w-6 h-6 rounded-full bg-steel-50" />
                </div>
                <div className="px-6 py-5 flex items-center gap-4">
                  <span className="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/30">
                    <KeyRound className="w-5 h-5" aria-hidden />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-steel-500 mb-1.5">{t('track.code')}</div>
                    <div className="flex gap-2 [perspective:400px]" aria-label={`${t('track.code')}: ${String(booked.otp).split('').join(' ')}`}>
                      {String(booked.otp)
                        .split('')
                        .map((d, i) => (
                          <span
                            key={i}
                            className="anim-flip w-11 h-14 rounded-xl bg-gradient-to-b from-steel-800 to-steel-950 dark:from-steel-200 dark:to-steel-100 text-white dark:text-steel-950 font-head text-3xl font-bold tabular flex items-center justify-center shadow-[0_6px_0_rgb(0_0_0/0.15)]"
                            style={{ animationDelay: `${900 + i * 140}ms` }}
                            aria-hidden
                          >
                            {d}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </Tilt>

        {/* What happens next */}
        <ol className="mt-8 grid sm:grid-cols-3 gap-3 text-left">
          {(donation ? [...NEXT.slice(0, 2), { ...NEXT[2], icon: HeartHandshake, title: 'Donated', text: 'Your items reach our NGO partner, with a certificate for you.' }] : NEXT).map((s, i) => (
            <li key={s.title} className="anim-rise rounded-2xl bg-surface border border-steel-200/70 p-4 shadow-card hover:-translate-y-1 transition-transform" style={{ animationDelay: `${1100 + i * 120}ms` }}>
              <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${s.tone} text-white flex items-center justify-center shadow-md`}>
                <s.icon className="w-4 h-4" aria-hidden />
              </span>
              <div className="font-semibold text-steel-900 text-sm mt-3">
                {i + 1}. {s.title}
              </div>
              <p className="text-xs text-steel-500 mt-1">{s.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={onTrack} className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:scale-105 active:scale-95">
            {t('book.track')}
          </Button>
          <Button size="lg" variant="outline" icon={CalendarPlus} onClick={onCalendar}>
            {t('book.addToCalendar')}
          </Button>
        </div>
      </div>
    </div>
  );
}
