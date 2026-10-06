import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import useApi from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { useConfig } from '../context/ConfigContext';
import { ErrorState, Skeleton } from '../components/ui';
import Estimator from '../components/Estimator';
import { RatesTable } from './Rates';
import { rupees } from '../utils/format';

// SEO landing page per city: /sell-scrap/<city>
export default function SellScrapCity() {
  const { city: slug } = useParams();
  const { data, error, loading } = useApi(`/public/cities/${slug}`);
  const { setCity } = useConfig();
  const city = data?.city;

  useEffect(() => {
    if (city) setCity(city);
  }, [city]);

  const top = data?.rates?.slice(0, 3) || [];
  usePageMeta({
    title: city ? `Sell scrap online in ${city} — doorstep pickup` : 'Sell scrap online',
    description: city
      ? `Sell scrap in ${city} at today's best rates. ${top.map((r) => `${r.name} Rs. ${r.minPrice}-${r.maxPrice}/${r.unit}`).join(', ')}. Free pickup, digital weighing, instant eSewa / Khalti payment.`
      : undefined,
  });

  useEffect(() => {
    if (!city) return undefined;
    // Structured data for search engines (LocalBusiness + offers).
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: `ScrapMate ${city}`,
      areaServed: city,
      description: `Doorstep scrap pickup in ${city}`,
      makesOffer: top.map((r) => ({ '@type': 'Offer', name: r.name, priceSpecification: { '@type': 'UnitPriceSpecification', price: r.maxPrice, priceCurrency: 'INR', unitText: r.unit } })),
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, [city]);

  if (error) {
    return (
      <div className="container-page py-16 max-w-xl">
        <ErrorState error={error} />
        <Link to="/rates" className="link mt-4 inline-block">
          See the cities we serve
        </Link>
      </div>
    );
  }

  return (
    <div>
      <section className="bg-ink text-white">
        <div className="container-page py-12 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_26rem] gap-10 items-center">
          <div>
            {loading && !data ? (
              <Skeleton className="h-12 w-80 !bg-white/10" />
            ) : (
              <h1 className="font-head text-3xl sm:text-5xl font-bold leading-tight">Sell scrap online in {city}</h1>
            )}
            <p className="text-[#c9ced3] mt-4 max-w-xl text-lg">
              Book a free doorstep pickup anywhere in {city}. A verified ScrapMate collector weighs your scrap in front of you and pays instantly.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-[#dfe3e6]">
              {['Free pickup, same-day or next-day slots', 'Digital weighing with photo proof', 'eSewa, Khalti, bank, cash or wallet payment', `${data?.itemCount || 30}+ items: paper, metals, e-waste, appliances, vehicles`].map((x) => (
                <li key={x} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#7fd39a]" aria-hidden /> {x}
                </li>
              ))}
            </ul>
            {top.length > 0 && (
              <p className="mt-6 text-sm text-[#aab1b8]">
                Popular in {city}: {top.map((r) => `${r.name} ${rupees(r.minPrice)}–${rupees(r.maxPrice)}/${r.unit}`).join(' · ')}
              </p>
            )}
          </div>
          <Estimator />
        </div>
      </section>
      <section className="container-page py-12">
        <div className="flex items-end justify-between gap-3 mb-6">
          <h2 className="font-head text-2xl font-semibold text-steel-900">Scrap rates in {city || '…'}</h2>
          <Link to="/schedule-pickup" className="link text-sm inline-flex items-center gap-1">
            Book a pickup <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>
        {city ? <RatesTable city={city} category="all" search="" /> : <Skeleton className="h-64" />}
      </section>
    </div>
  );
}
