// Demo geography for the Kathmandu valley: 3 cities (one price list each, one
// per district) and their 21 local levels. Everything here is editable later in
// Admin > Service areas. Postal codes are Nepal Post office codes serving each
// municipality (several municipalities share an office); check the rural ones
// against your own delivery data before going live.
const CITIES = [
  { name: 'Kathmandu', nameNe: 'काठमाडौं', district: 'Kathmandu', province: 'Bagmati', center: { lat: 27.7172, lng: 85.324 }, isDefault: true, sortOrder: 0, priceFactor: 1.0 },
  { name: 'Lalitpur', nameNe: 'ललितपुर', district: 'Lalitpur', province: 'Bagmati', center: { lat: 27.6644, lng: 85.3188 }, sortOrder: 1, priceFactor: 1.0 },
  { name: 'Bhaktapur', nameNe: 'भक्तपुर', district: 'Bhaktapur', province: 'Bagmati', center: { lat: 27.671, lng: 85.4298 }, sortOrder: 2, priceFactor: 0.98 },
];

const CORE = { minPickupWeightKg: 5, minPickupValue: 100 };
const OUTER = { minPickupWeightKg: 10, minPickupValue: 200 };

// [name, nameNe, type, wards, postal codes, [lat, lng], minimums, active]
const AREAS = {
  Kathmandu: [
    ['Kathmandu Metropolitan City', 'काठमाडौं महानगरपालिका', 'metropolitan', 32, ['44600', '44602', '44604', '44605', '44606', '44609', '44611', '44614', '44616', '44617', '44620', '44621'], [27.7172, 85.324], CORE],
    ['Kirtipur', 'कीर्तिपुर नगरपालिका', 'municipality', 10, ['44618', '44613'], [27.6787, 85.2775], CORE],
    ['Budhanilkantha', 'बूढानीलकण्ठ नगरपालिका', 'municipality', 13, ['44622'], [27.765, 85.365], CORE],
    ['Tokha', 'टोखा नगरपालिका', 'municipality', 11, ['44608'], [27.76, 85.324], CORE],
    ['Tarakeshwar', 'तारकेश्वर नगरपालिका', 'municipality', 11, ['44610'], [27.769, 85.295], CORE],
    ['Nagarjun', 'नागार्जुन नगरपालिका', 'municipality', 10, ['44620'], [27.729, 85.26], CORE],
    ['Chandragiri', 'चन्द्रागिरि नगरपालिका', 'municipality', 15, ['44619'], [27.688, 85.22], CORE],
    ['Gokarneshwar', 'गोकर्णेश्वर नगरपालिका', 'municipality', 9, ['44603', '44806'], [27.751, 85.39], CORE],
    ['Kageshwori-Manohara', 'कागेश्वरी मनोहरा नगरपालिका', 'municipality', 9, ['44600'], [27.715, 85.405], CORE],
    ['Dakshinkali', 'दक्षिणकाली नगरपालिका', 'municipality', 9, ['44615'], [27.615, 85.265], OUTER],
    ['Shankharapur', 'शङ्खरापुर नगरपालिका', 'municipality', 9, ['44601'], [27.741, 85.46], OUTER],
  ],
  Lalitpur: [
    ['Lalitpur Metropolitan City', 'ललितपुर महानगरपालिका', 'metropolitan', 29, ['44700', '44703', '44707'], [27.6644, 85.3188], CORE],
    ['Mahalaxmi', 'महालक्ष्मी नगरपालिका', 'municipality', 10, ['44705', '44708'], [27.652, 85.372], CORE],
    ['Godawari', 'गोदावरी नगरपालिका', 'municipality', 14, ['44709', '44710'], [27.593, 85.378], CORE],
    ['Mahankal', 'महाङ्काल गाउँपालिका', 'rural_municipality', 6, ['44711'], [27.565, 85.415], OUTER],
    // Hill areas we don't serve yet: listed so admins can switch them on later.
    ['Konjyosom', 'कोन्ज्योसोम गाउँपालिका', 'rural_municipality', 5, ['44712'], [27.53, 85.38], OUTER, false],
    ['Bagmati', 'बागमती गाउँपालिका', 'rural_municipality', 7, ['44713'], [27.475, 85.305], OUTER, false],
  ],
  Bhaktapur: [
    ['Bhaktapur', 'भक्तपुर नगरपालिका', 'municipality', 10, ['44800'], [27.671, 85.4298], CORE],
    ['Madhyapur Thimi', 'मध्यपुर थिमि नगरपालिका', 'municipality', 9, ['44811', '44810'], [27.681, 85.387], CORE],
    ['Suryabinayak', 'सूर्यविनायक नगरपालिका', 'municipality', 10, ['44809', '44800'], [27.655, 85.435], CORE],
    ['Changunarayan', 'चाँगुनारायण नगरपालिका', 'municipality', 9, ['44802', '44804', '44805', '44812'], [27.716, 85.428], OUTER],
  ],
};

function areaDocs() {
  return CITIES.flatMap((city) =>
    AREAS[city.name].map(([name, nameNe, type, wards, pinCodes, [lat, lng], mins, active = true], i) => ({
      name,
      nameNe,
      city: city.name,
      type,
      district: city.district,
      state: city.province,
      wards,
      servedWards: [],
      pinCodes,
      center: { lat, lng },
      ...mins,
      isActive: active,
      sortOrder: i,
    }))
  );
}

module.exports = { CITIES, AREAS, areaDocs };
