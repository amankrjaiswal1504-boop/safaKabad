import usePageMeta from '../hooks/usePageMeta';
import { PageHeader } from '../components/ui';

const SECTIONS = [
  ['Indicative prices', 'Rates shown on the website, app and chat are indicative. The final amount is calculated from the actual weight and condition verified at pickup, using the SafaKabad rate for your city on that day.'],
  ['Pickups', 'Pickups are free. You can reschedule up to the cutoff shown on your pickup page and cancel before the collector arrives. Repeated last-minute cancellations may limit future bookings.'],
  ['Door code', 'For your safety, collectors must enter the 4-digit code from your pickup page before weighing. Only share it with the collector at your door.'],
  ['Payments', 'Payouts are made by cash, eSewa, Khalti, bank transfer or to your SafaKabad wallet. Wallet balances can be withdrawn to eSewa, Khalti or a Nepali bank account after review.'],
  ['Disputes', 'If you disagree with a weighing, choose "Dispute" before accepting. Our support team reviews the photographed scale readings and contacts you.'],
  ['Privacy', 'We use your phone number, address and location only to arrange and complete pickups, send updates you have opted into, and meet legal requirements. We never sell your data. Location sharing by collectors is only active during a trip.'],
  ['Prohibited items', 'We do not accept hazardous, medical, explosive or stolen items. Vehicles require valid ownership documents.'],
];

export default function Terms() {
  usePageMeta({ title: 'Terms & privacy' });
  return (
    <div className="container-page py-10 max-w-3xl">
      <PageHeader title="Terms & privacy" subtitle="The short version of how SafaKabad works with you." />
      <div className="space-y-6">
        {SECTIONS.map(([h, p]) => (
          <section key={h}>
            <h2 className="font-semibold text-steel-900">{h}</h2>
            <p className="text-steel-600 mt-1 leading-relaxed">{p}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
