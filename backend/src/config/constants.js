// Shared constants. TIME_SLOTS is the default slot list; admins can change
// slots, capacity and cutoffs in Settings (see services/settingsService.js).
const TIME_SLOTS = ['9:00 AM - 11:00 AM', '11:00 AM - 1:00 PM', '2:00 PM - 4:00 PM', '4:00 PM - 6:00 PM'];

const DEFAULT_CITY = process.env.DEFAULT_CITY || 'Kathmandu';

// Customers may change a pickup only before the collector is on the way.
const RESCHEDULABLE_STATUSES = ['BOOKED', 'ASSIGNED'];

module.exports = { TIME_SLOTS, DEFAULT_CITY, RESCHEDULABLE_STATUSES };
