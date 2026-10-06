import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, render } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import OtpInput from '../components/OtpInput';
import PickupTimeline from '../components/PickupTimeline';
import { rupees, compact, addressLine, slugify } from '../utils/format';
import { buildWhatsAppLink, buildWhatsAppText, pickupIdFromPath } from '../utils/whatsapp';
import { renderWithProviders } from './utils';
import { I18nProvider } from '../i18n/I18nContext';

// ---- API mock for components that fetch ----
const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../services/api', () => ({ default: apiMock, download: vi.fn(), uploadPhotos: vi.fn(), API_URL: 'http://x/api', API_ORIGIN: 'http://x' }));
vi.mock('../context/ConfigContext', () => ({ useConfig: () => ({ city: 'Kathmandu', cities: ['Kathmandu'], config: {} }) }));

describe('format utils', () => {
  it('formats Nepali rupees with lakh grouping', () => {
    expect(rupees(123456)).toBe('Rs. 1,23,456');
    expect(rupees(12.5, { decimals: 2 })).toBe('Rs. 12.50');
  });
  it('compacts large numbers in lakh/crore', () => {
    expect(compact(1500)).toBe('1.5K');
    expect(compact(250000)).toBe('2.5 L');
  });
  it('builds address lines and slugs', () => {
    expect(addressLine({ houseNumber: '1', street: 'MG Rd', locality: 'X', city: 'Pune', pinCode: '411001' })).toBe('1, MG Rd, X, Pune – 411001');
    expect(slugify('Delhi NCR')).toBe('delhi-ncr');
  });
});

describe('WhatsApp helpers', () => {
  it('prefills the pickup ID and user name', () => {
    expect(pickupIdFromPath('/pickups/sm-2026-000123')).toBe('SM-2026-000123');
    const text = buildWhatsAppText({ user: { name: 'Asha' }, pickupId: 'SM-2026-000123' });
    expect(text).toBe('Hi ScrapMate, this is Asha. I need help with pickup SM-2026-000123.');
    expect(buildWhatsAppLink('919876543210', 'a b')).toBe('https://wa.me/919876543210?text=a%20b');
  });
});

describe('OtpInput', () => {
  function Harness() {
    const [v, setV] = useState('');
    return (
      <>
        <OtpInput length={4} value={v} onChange={setV} />
        <output data-testid="val">{v}</output>
      </>
    );
  }
  it('accepts a pasted code and fills every box', () => {
    render(<Harness />);
    fireEvent.paste(screen.getByLabelText('Digit 1'), { clipboardData: { getData: () => '12-34' } });
    expect(screen.getByTestId('val')).toHaveTextContent('1234');
    expect(screen.getByLabelText('Digit 4')).toHaveValue('4');
  });
  it('ignores non-digits while typing', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Digit 1'), { target: { value: 'a' } });
    expect(screen.getByTestId('val')).toHaveTextContent('');
  });
});

describe('PickupTimeline', () => {
  it('marks completed steps and the current step', () => {
    render(<PickupTimeline status="COLLECTOR_ON_THE_WAY" history={[]} />);
    expect(screen.getByText('On the way')).toBeInTheDocument();
    expect(screen.getByText('(current)')).toBeInTheDocument();
  });
  it('shows a cancelled state', () => {
    render(<PickupTimeline status="CANCELLED" history={[{ status: 'CANCELLED', at: new Date().toISOString() }]} />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });
});

describe('Estimator', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          rates: [
            { itemId: 'a'.repeat(24), name: 'Newspaper', unit: 'kg', minPrice: 12, maxPrice: 14, category: { name: 'Paper', slug: 'paper' } },
            { itemId: 'b'.repeat(24), name: 'Laptop', unit: 'piece', minPrice: 200, maxPrice: 600, category: { name: 'E-Waste', slug: 'e-waste', conditionGrading: true } },
          ],
        },
      },
    });
    apiMock.post.mockResolvedValue({ data: { data: { min: 120, max: 140, weightKg: 10, lines: [] } } });
  });

  it('shows a server-calculated estimate and deep-links into booking', async () => {
    const { default: Estimator } = await import('../components/Estimator');
    function Where() {
      const loc = useLocation();
      return <div data-testid="where">{loc.pathname + loc.search}</div>;
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <WrappedI18n>
                <Estimator />
              </WrappedI18n>
            }
          />
          <Route path="/schedule-pickup" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Rs. 120 – Rs. 140')).toBeInTheDocument();
    expect(apiMock.post).toHaveBeenCalledWith('/scrap/estimate', expect.objectContaining({ city: 'Kathmandu' }));
    fireEvent.click(screen.getByRole('button', { name: /book this pickup/i }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain(`/schedule-pickup?items=${encodeURIComponent(`${'a'.repeat(24)}:10`)}`));
  });
});

function WrappedI18n({ children }) {
  return <I18nProvider>{children}</I18nProvider>;
}

describe('renderWithProviders', () => {
  it('renders translated text', async () => {
    const { useI18n } = await import('../i18n/I18nContext');
    function T() {
      const { t } = useI18n();
      return <span>{t('nav.rates')}</span>;
    }
    renderWithProviders(<T />);
    expect(screen.getByText('Scrap rates')).toBeInTheDocument();
  });
});
