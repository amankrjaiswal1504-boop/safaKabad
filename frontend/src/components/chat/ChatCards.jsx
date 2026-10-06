import { useNavigate, useLocation } from 'react-router-dom';
import { buildWhatsAppLink, buildWhatsAppText } from '../../utils/whatsapp';

const STATUS_STEPS = ['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING', 'COMPLETED'];
const STATUS_LABEL = {
  BOOKED: 'Booked',
  ASSIGNED: 'Collector assigned',
  COLLECTOR_ON_THE_WAY: 'Collector on the way',
  ARRIVED: 'Collector arrived',
  WEIGHING: 'Weighing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const rupees = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function CardShell({ title, children, footer }) {
  return (
    <div className="mt-2 bg-surface border border-steel-100 rounded-lg text-sm overflow-hidden">
      {title && <div className="px-3 py-2 border-b border-steel-100 font-medium text-steel-900">{title}</div>}
      <div className="px-3 py-2">{children}</div>
      {footer && <div className="px-3 py-2 border-t border-steel-100 bg-steel-50">{footer}</div>}
    </div>
  );
}

function RatesCard({ card, onPrefill, go }) {
  return (
    <CardShell
      title={`Rates in ${card.city}`}
      footer={
        <button type="button" className="text-rust-600 font-medium text-xs hover:underline" onClick={() => go('/rates')}>
          See all rates{card.more ? ` (+${card.more} more)` : ''} →
        </button>
      }
    >
      <ul className="divide-y divide-steel-100 -my-1">
        {card.rates.map((r) => (
          <li key={r.itemId}>
            <button
              type="button"
              onClick={() => onPrefill(`I have ${r.unit === 'kg' ? '10 kg' : '1'} ${r.name}, what will I get?`)}
              className="w-full flex justify-between gap-3 py-1.5 text-left hover:text-rust-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-patina-500 rounded-lg"
              title={`Estimate for ${r.name}`}
            >
              <span>{r.name}</span>
              <span className="font-medium whitespace-nowrap">
                {rupees(r.minPrice)}–{rupees(r.maxPrice)}
                <span className="text-steel-500 font-normal">/{r.unit}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function EstimateCard({ card, go }) {
  const itemsParam = card.items.map((i) => `${i.itemId}:${i.quantity}`).join(',');
  return (
    <CardShell
      title="Estimated payout"
      footer={
        <button type="button" className="btn-primary text-xs w-full py-2" onClick={() => go(`/schedule-pickup?items=${itemsParam}`)}>
          Book this pickup
        </button>
      }
    >
      <ul className="space-y-1">
        {card.items.map((i) => (
          <li key={i.itemId} className="flex justify-between gap-3">
            <span>
              {i.name} <span className="text-steel-500">× {i.quantity} {i.unit}</span>
            </span>
            <span className="whitespace-nowrap">
              {i.priced ? `${rupees(i.min)}–${rupees(i.max)}` : 'No rate'}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between mt-2 pt-2 border-t border-steel-100 font-semibold text-patina-700">
        <span>Total</span>
        <span>
          {rupees(card.min)}–{rupees(card.max)}
        </span>
      </div>
      <p className="text-[11px] text-steel-500 mt-1">Estimate for {card.city}. Final amount is based on actual weight.</p>
    </CardShell>
  );
}

function TrackingCard({ pickup, go, canOpen }) {
  const cancelled = pickup.status === 'CANCELLED';
  const stepIdx = STATUS_STEPS.indexOf(pickup.status);
  return (
    <CardShell
      title={
        <span className="flex justify-between gap-2">
          <span>{pickup.pickupId}</span>
          <span className={`text-xs px-2 py-0.5 rounded-lg ${cancelled ? 'bg-rust-100 text-rust-700' : 'bg-patina-100 text-patina-700'}`}>
            {STATUS_LABEL[pickup.status] || pickup.status}
          </span>
        </span>
      }
      footer={
        canOpen && (
          <button type="button" className="text-rust-600 font-medium text-xs hover:underline" onClick={() => go(`/pickups/${pickup.pickupId}`)}>
            Open pickup details →
          </button>
        )
      }
    >
      {!cancelled && (
        <div className="flex gap-1 mb-2" aria-label={`Step ${stepIdx + 1} of ${STATUS_STEPS.length}`}>
          {STATUS_STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-patina-600' : 'bg-steel-100'}`} />
          ))}
        </div>
      )}
      <div className="text-steel-700 space-y-0.5">
        <div>
          {pickup.scheduledDate} · {pickup.timeSlot}
        </div>
        {pickup.collectorName && <div>Collector: {pickup.collectorName}</div>}
        <div className="text-steel-500 text-xs">
          {pickup.items.map((i) => i.name).join(', ')}
          {pickup.finalAmount != null
            ? ` · Final ${rupees(pickup.finalAmount)}`
            : ` · Est. ${rupees(pickup.estimatedValueMin)}–${rupees(pickup.estimatedValueMax)}`}
        </div>
      </div>
    </CardShell>
  );
}

function PickupsCard({ card, onSend }) {
  return (
    <CardShell title="Your recent pickups">
      <ul className="divide-y divide-steel-100 -my-1">
        {card.pickups.map((p) => (
          <li key={p.pickupId}>
            <button
              type="button"
              onClick={() => onSend(`Track ${p.pickupId}`)}
              className="w-full flex justify-between gap-2 py-1.5 text-left hover:text-rust-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-patina-500 rounded-lg"
            >
              <span className="font-medium">{p.pickupId}</span>
              <span className="text-steel-500 text-xs">{STATUS_LABEL[p.status] || p.status}</span>
            </button>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function ConfirmCard({ card, onResolve, busy }) {
  const done = card.state !== 'pending';
  const stateLabel = { confirmed: 'Confirmed', dismissed: 'Not changed', failed: 'Could not complete', expired: 'Expired' };
  return (
    <CardShell title="Please confirm">
      <p className="text-steel-700">{card.summary}</p>
      {done ? (
        <p className="mt-2 text-xs font-medium text-steel-500">{stateLabel[card.state] || card.state}</p>
      ) : (
        <div className="flex gap-2 mt-2">
          <button type="button" disabled={busy} className="btn-primary text-xs py-1.5 px-3" onClick={() => onResolve(card.actionId, 'confirm')}>
            Confirm
          </button>
          <button type="button" disabled={busy} className="btn-outline text-xs py-1.5 px-3" onClick={() => onResolve(card.actionId, 'dismiss')}>
            Keep as is
          </button>
        </div>
      )}
    </CardShell>
  );
}

function HandoffCard({ card, user, number }) {
  const text = buildWhatsAppText({ user, extra: `Ticket ${card.ticketId}: ${String(card.summary || '').slice(0, 500)}` });
  return (
    <CardShell title="Talk to our team">
      <p className="text-steel-700 text-xs mb-2">
        Ticket <span className="font-medium">{card.ticketId}</span> created. Our team can see this conversation.
      </p>
      <a
        href={buildWhatsAppLink(number, text)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 w-full bg-[#1F8A4C] hover:bg-[#18703D] text-white text-xs font-medium py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#1F8A4C]"
      >
        Chat on WhatsApp
      </a>
    </CardShell>
  );
}

export default function ChatCards({ cards, user, whatsappNumber, onSend, onPrefill, onResolve, onNavigate, busy }) {
  const navigate = useNavigate();
  const location = useLocation();
  const go = (to, state) => {
    navigate(to, state ? { state } : undefined);
    onNavigate?.();
  };
  return cards.map((card, i) => {
    const key = `${card.type}-${i}`;
    switch (card.type) {
      case 'rates':
        return <RatesCard key={key} card={card} onPrefill={onPrefill} go={go} />;
      case 'estimate':
        return <EstimateCard key={key} card={card} go={go} />;
      case 'tracking':
        return <TrackingCard key={key} pickup={card.pickup} go={go} canOpen={user?.role !== 'collector'} />;
      case 'pickups':
        return <PickupsCard key={key} card={card} onSend={onSend} />;
      case 'confirm':
        return <ConfirmCard key={key} card={card} onResolve={onResolve} busy={busy} />;
      case 'handoff':
        return <HandoffCard key={key} card={card} user={user} number={whatsappNumber} />;
      case 'login':
        return (
          <CardShell key={key}>
            <button type="button" className="btn-secondary text-xs w-full py-2" onClick={() => go('/login', { from: location.pathname + location.search })}>
              Log in to continue
            </button>
          </CardShell>
        );
      case 'link':
        return (
          <CardShell key={key}>
            <button type="button" className="btn-secondary text-xs w-full py-2" onClick={() => go(card.to)}>
              {card.label}
            </button>
          </CardShell>
        );
      default:
        return null;
    }
  });
}
