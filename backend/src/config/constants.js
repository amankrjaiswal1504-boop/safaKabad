// Shared constants. TIME_SLOTS is the default slot list; admins can change
// slots, capacity and cutoffs in Settings (see services/settingsService.js).
// Cities and the default city are managed in Admin > Service areas.
const TIME_SLOTS = ['9:00 AM - 11:00 AM', '11:00 AM - 1:00 PM', '2:00 PM - 4:00 PM', '4:00 PM - 6:00 PM'];

// Customers may change a pickup only before the collector is on the way.
const RESCHEDULABLE_STATUSES = ['BOOKED', 'ASSIGNED'];

module.exports = { TIME_SLOTS, RESCHEDULABLE_STATUSES };
