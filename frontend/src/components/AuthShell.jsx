import { CheckCircle2 } from 'lucide-react';

// Split layout for auth pages: brand panel (desktop) + form card.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="container-page py-10 sm:py-16">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-2 rounded-2xl overflow-hidden border border-steel-100 shadow-lift bg-surface">
        <div className="hidden lg:flex flex-col justify-between bg-ink text-white p-10 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} aria-hidden />
          <div className="relative">
            <h2 className="font-head text-3xl font-bold leading-tight">Turn clutter into cash, without leaving home.</h2>
            <ul className="mt-8 space-y-3 text-[#DDE5E1]">
              {['Free doorstep pickup in 10 cities', 'Rates you can see before you book', 'Weighed in front of you, with photos', 'Paid instantly: eSewa, Khalti, bank, cash or wallet'].map((x) => (
                <li key={x} className="flex items-center gap-2.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-[#7FD3A8] shrink-0" aria-hidden /> {x}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-[#8A9A93]">Your number is only used for pickup updates. We never share it.</p>
        </div>
        <div className="p-6 sm:p-10">
          <h1 className="font-head text-2xl sm:text-3xl font-semibold text-steel-900">{title}</h1>
          {subtitle && <p className="text-steel-500 mt-1.5">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-sm text-steel-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
