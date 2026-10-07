import { Link } from 'react-router-dom';
import { Award, BookOpen, HandHeart, Laptop, Shirt } from 'lucide-react';
import useApi from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { useConfig } from '../context/ConfigContext';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';

const ACCEPTS = { 'normal-recyclables': 'Clothes, books & paper', 'e-waste': 'Laptops & phones', appliances: 'Appliances', 'vehicle-scrap': 'Vehicles' };

export default function Donate() {
  const { city } = useConfig();
  const { data, loading } = useApi('/public/ngos', { params: { city } });
  usePageMeta({ title: 'Donate instead of selling', description: 'Donate clothes, books and old electronics to verified NGO partners through SafaKabad. Free pickup and a donation certificate.' });
  return (
    <div className="container-page py-10">
      <PageHeader title="Donate instead of selling" subtitle="Choose a verified NGO partner when you book. We pick up for free and send you a donation certificate." />
      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        {[
          { icon: Shirt, t: 'Clothes & textiles', d: 'Reused for families in need.' },
          { icon: BookOpen, t: 'Books', d: 'Community libraries in government schools.' },
          { icon: Laptop, t: 'Old laptops & phones', d: 'Refurbished for students.' },
        ].map((x) => (
          <Card key={x.t} className="flex gap-4 items-start">
            <span className="w-11 h-11 rounded-xl bg-patina-50 text-patina-700 flex items-center justify-center shrink-0">
              <x.icon className="w-5 h-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold text-steel-900">{x.t}</h2>
              <p className="text-sm text-steel-500 mt-0.5">{x.d}</p>
            </div>
          </Card>
        ))}
      </div>
      <h2 className="font-head text-xl font-semibold text-steel-900 mb-4">Our NGO partners</h2>
      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : !data?.ngos?.length ? (
        <EmptyState icon={HandHeart} title="No partners in this city yet" description="Try another city from the menu, or sell and donate the proceeds." />
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {data.ngos.map((n) => (
            <Card key={n._id} className="flex flex-col">
              <div className="flex items-center gap-3">
                {n.logo ? <img src={n.logo} alt="" className="w-11 h-11 rounded-lg object-cover" /> : <span className="w-11 h-11 rounded-lg bg-rust-50 text-rust-600 flex items-center justify-center"><HandHeart className="w-5 h-5" aria-hidden /></span>}
                <h3 className="font-semibold text-steel-900">{n.name}</h3>
              </div>
              <p className="text-sm text-steel-600 mt-3 flex-1">{n.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {n.accepts.map((a) => (
                  <Badge key={a} tone="patina">
                    {ACCEPTS[a] || a}
                  </Badge>
                ))}
              </div>
              {n.registrationNumber && <p className="text-xs text-steel-400 mt-3">Reg. {n.registrationNumber}</p>}
            </Card>
          ))}
        </div>
      )}
      <div className="mt-10 rounded-2xl bg-patina-50 border border-patina-100 p-6 sm:p-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-3 items-start">
          <Award className="w-8 h-8 text-patina-600 shrink-0" aria-hidden />
          <div>
            <h2 className="font-semibold text-steel-900">You get a donation certificate</h2>
            <p className="text-sm text-steel-600">Download it from your pickup page once the donation is collected.</p>
          </div>
        </div>
        <Link to="/schedule-pickup?type=donation" className="btn-primary">
          Schedule a donation pickup
        </Link>
      </div>
    </div>
  );
}
