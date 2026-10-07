import { Link } from 'react-router-dom';
import { BadgeCheck, Camera, CreditCard, FileText, KeyRound, MapPin, Scale, Smartphone, Truck } from 'lucide-react';
import useApi from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { PageHeader, Skeleton, Tabs } from '../components/ui';
import { useState } from 'react';

const STEPS = [
  { icon: Smartphone, title: 'Book in a minute', text: 'Pick your items and approximate quantity, see an instant estimate, choose an address and a time slot. No password needed: verify your phone with a one-time code.' },
  { icon: Truck, title: 'Track your collector', text: 'You get a notification when a collector is assigned and when they start the trip. Follow them live on the map with an ETA.' },
  { icon: KeyRound, title: 'Share your door code', text: 'At your door the collector enters the 4-digit code from your pickup page. This proves it is really your SafaKabad collector before anything is weighed.' },
  { icon: Scale, title: 'Weighed in front of you', text: 'Each item is weighed on a digital scale and the reading is photographed. The rate comes from SafaKabad\'s published price list for your city; collectors can\'t change it.' },
  { icon: BadgeCheck, title: 'Review and accept', text: 'See the final amount on your phone with every weight and rate. Accept it, or raise a dispute and our team steps in.' },
  { icon: CreditCard, title: 'Get paid instantly', text: 'Choose eSewa, Khalti, bank transfer, cash or your SafaKabad wallet. A PDF receipt is emailed and saved in your account.' },
];

export default function HowItWorks() {
  usePageMeta({ title: 'How it works', description: 'How SafaKabad doorstep scrap pickup works: book, track, door-code verification, digital weighing with photo proof and instant payment.' });
  const { data } = useApi('/public/faqs');
  const topics = [...new Set((data?.faqs || []).map((f) => f.topic))];
  const [topic, setTopic] = useState('all');
  const faqs = (data?.faqs || []).filter((f) => topic === 'all' || f.topic === topic);

  return (
    <div className="container-page py-10">
      <PageHeader title="How SafaKabad works" subtitle="Six simple steps from booking to payment, with safety and transparency built in." />
      <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card !p-6">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-rust-50 text-rust-600 flex items-center justify-center">
                <s.icon className="w-5 h-5" aria-hidden />
              </span>
              <span className="text-xs font-semibold text-steel-400">STEP {i + 1}</span>
            </div>
            <h2 className="font-semibold text-steel-900 mt-4 text-lg">{s.title}</h2>
            <p className="text-sm text-steel-600 mt-1.5 leading-relaxed">{s.text}</p>
          </li>
        ))}
      </ol>

      <div className="grid md:grid-cols-3 gap-5 mt-10">
        {[
          { icon: Camera, t: 'Photo proof', d: 'Every scale reading is photographed and shown on your receipt.' },
          { icon: MapPin, t: 'Municipality & ward coverage', d: 'Pick your municipality and ward while booking. We show only the places we serve, plus any minimum.' },
          { icon: FileText, t: 'Certificates', d: 'Donation certificates for NGO donations and certified e-waste disposal certificates for businesses.' },
        ].map((x) => (
          <div key={x.t} className="rounded-xl bg-surface-2 border border-steel-100 p-5">
            <x.icon className="w-6 h-6 text-patina-600" aria-hidden />
            <h3 className="font-semibold text-steel-900 mt-3">{x.t}</h3>
            <p className="text-sm text-steel-600 mt-1">{x.d}</p>
          </div>
        ))}
      </div>

      <section id="faq" className="mt-14 scroll-mt-24">
        <h2 className="font-head text-2xl font-semibold text-steel-900 mb-4">Frequently asked questions</h2>
        <Tabs value={topic} onChange={setTopic} tabs={[{ value: 'all', label: 'All' }, ...topics.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))]} className="mb-2" />
        <div className="divide-y divide-steel-100 bg-surface rounded-xl border border-steel-100 px-5">
          {!data && <Skeleton className="h-40 my-4" />}
          {faqs.map((f) => (
            <details key={f._id} className="group py-4">
              <summary className="cursor-pointer list-none flex justify-between items-center gap-4 font-medium text-steel-900">
                {f.question}
                <span className="w-7 h-7 rounded-full bg-steel-100 text-steel-600 flex items-center justify-center shrink-0 group-open:rotate-45 transition-transform" aria-hidden>
                  +
                </span>
              </summary>
              <p className="text-steel-600 text-sm mt-2 pr-10">{f.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <div className="mt-10 text-center">
        <Link to="/schedule-pickup" className="btn-primary !px-8 !py-3">
          Book a free pickup
        </Link>
      </div>
    </div>
  );
}
