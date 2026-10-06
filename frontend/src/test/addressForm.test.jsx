import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import AddressForm from '../components/AddressForm';
import { renderWithProviders } from './utils';

vi.mock('../services/api', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: { data: { results: [] } } })) } }));
// Leaflet doesn't run in jsdom; the map is covered by the e2e test.
vi.mock('../components/MapView', () => ({ default: () => <div data-testid="map" /> }));

// Service areas exactly as /public/config returns them (admin-managed).
const AREAS = [
  { _id: 'a1', name: 'Kirtipur', city: 'Kathmandu', type: 'municipality', district: 'Kathmandu', state: 'Bagmati', wards: 10, servedWards: [1, 2, 3], pinCodes: ['44618', '44613'], center: { lat: 27.68, lng: 85.28 }, minPickupWeightKg: 5, minPickupValue: 100 },
  { _id: 'a2', name: 'Tokha', city: 'Kathmandu', type: 'municipality', district: 'Kathmandu', state: 'Bagmati', wards: 11, servedWards: [], pinCodes: ['44608'], center: null, minPickupWeightKg: 0, minPickupValue: 0 },
  { _id: 'b1', name: 'Bhaktapur', city: 'Bhaktapur', type: 'municipality', district: 'Bhaktapur', state: 'Bagmati', wards: 10, servedWards: [], pinCodes: ['44800'], center: null, minPickupWeightKg: 0, minPickupValue: 0 },
];
vi.mock('../context/ConfigContext', () => ({
  useConfig: () => ({
    loading: false,
    cities: ['Kathmandu', 'Bhaktapur'],
    cityList: [{ name: 'Kathmandu' }, { name: 'Bhaktapur' }],
    city: 'Kathmandu',
    defaultCity: 'Kathmandu',
    serviceAreas: AREAS,
    areasFor: (c) => AREAS.filter((a) => a.city === c),
    areaById: (id) => AREAS.find((a) => a._id === id) || null,
    mapCenter: () => [27.7, 85.3],
  }),
}));

describe('AddressForm', () => {
  it('offers only configured municipalities and wards, and sends area + ward', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<AddressForm onSubmit={onSubmit} />);

    const municipality = screen.getByLabelText(/Municipality/);
    // Only Kathmandu's municipalities while Kathmandu is selected.
    expect([...municipality.options].map((o) => o.textContent)).toEqual(['Select municipality', 'Kirtipur', 'Tokha']);
    fireEvent.change(municipality, { target: { value: 'a1' } });

    const ward = screen.getByLabelText(/Ward/);
    expect(ward.options).toHaveLength(11); // placeholder + 10 wards
    expect(screen.getByRole('option', { name: 'Ward 2' }).disabled).toBe(false);
    expect(screen.getByRole('option', { name: /Ward 7 · coming soon/ }).disabled).toBe(true);
    expect(screen.getByText(/We pick up in Kirtipur/)).toBeInTheDocument();

    // Postal code comes from the area (choice between its post offices).
    expect(screen.getByLabelText('Postal code').value).toBe('44618');

    fireEvent.change(ward, { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Tole \/ street/), { target: { value: 'Naya Bazar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ areaId: 'a1', ward: 2, street: 'Naya Bazar', pinCode: '44618', city: 'Kathmandu', locality: 'Kirtipur-2' })
    );
  });

  it('switching city lists that city’s municipalities and validates required fields', () => {
    const onSubmit = vi.fn();
    renderWithProviders(<AddressForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/^City/), { target: { value: 'Bhaktapur' } });
    expect([...screen.getByLabelText(/Municipality/).options].map((o) => o.textContent)).toEqual(['Select municipality', 'Bhaktapur']);
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Choose your municipality')).toBeInTheDocument();
    expect(screen.getByText('Enter your tole or street')).toBeInTheDocument();
  });
});
