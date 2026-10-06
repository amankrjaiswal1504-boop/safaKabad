const Pickup = require('../models/Pickup');
const { Coupon } = require('../models/platform');
const { RESCHEDULABLE_STATUSES } = require('../config/constants');
const { assertSlotAvailable, canReschedule } = require('./slotService');
const { pickupStatusChanged, notify } = require('./notificationService');

class PickupActionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Pickups a user may see: customers their own, collectors their assigned, admins/staff any.
function ownershipFilter(user) {
  if (user.role === 'customer') return { customer: user._id };
  if (user.role === 'collector') return { collector: user._id };
  return {};
}

async function findOwnedPickup(user, pickupId) {
  return Pickup.findOne({ pickupId: String(pickupId).toUpperCase(), ...ownershipFilter(user) });
}

async function releaseCoupon(pickup) {
  if (pickup.coupon?.code) await Coupon.updateOne({ code: pickup.coupon.code, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
}

async function cancelCustomerPickup(user, pickupId, reason) {
  const pickup = await Pickup.findOne({ pickupId: String(pickupId).toUpperCase(), customer: user._id });
  if (!pickup) throw new PickupActionError('Pickup not found', 404);
  if (['COMPLETED', 'CANCELLED'].includes(pickup.status)) {
    throw new PickupActionError(`Cannot cancel a pickup that is ${pickup.status}`);
  }
  if (['ARRIVED', 'WEIGHING'].includes(pickup.status)) {
    throw new PickupActionError('The collector is already at your door. Please talk to them or contact support.');
  }
  pickup.status = 'CANCELLED';
  pickup.cancelReason = String(reason || 'Cancelled by customer').slice(0, 300);
  pickup.cancelledBy = 'customer';
  pickup.$locals.changedBy = user._id;
  await pickup.save();
  await releaseCoupon(pickup);
  await pickupStatusChanged(pickup);
  if (pickup.collector) {
    await notify(pickup.collector, {
      type: 'collector.cancelled',
      title: 'Pickup cancelled',
      body: `${pickup.pickupId} was cancelled by the customer.`,
      link: '/collector',
      channels: ['inapp', 'push'],
    });
  }
  return pickup;
}

// Returns an error message, or null when (date, slot) looks valid. Full
// availability (capacity, holidays, cutoffs) is checked by slotService.
function validateSlot(date, slot) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return 'Date must be in YYYY-MM-DD format';
  if (!slot) return 'Choose a time slot';
  return null;
}

async function rescheduleCustomerPickup(user, pickupId, date, slot) {
  const pickup = await Pickup.findOne({ pickupId: String(pickupId).toUpperCase(), customer: user._id });
  if (!pickup) throw new PickupActionError('Pickup not found', 404);
  if (!RESCHEDULABLE_STATUSES.includes(pickup.status)) {
    throw new PickupActionError(`Cannot reschedule a pickup that is ${pickup.status}`);
  }
  if (!(await canReschedule(pickup))) {
    throw new PickupActionError('It is too close to the pickup time to reschedule. Please contact support.');
  }
  const invalid = validateSlot(date, slot) || (await assertSlotAvailable(date, slot, { areaId: pickup.area, pinCode: pickup.pinCode, excludePickupId: pickup.pickupId }));
  if (invalid) throw new PickupActionError(invalid);
  pickup.scheduledDate = new Date(`${date}T00:00:00.000Z`);
  pickup.timeSlot = slot;
  pickup.rescheduleCount += 1;
  await pickup.save();
  if (pickup.collector) {
    await notify(pickup.collector, {
      type: 'collector.rescheduled',
      title: 'Pickup rescheduled',
      body: `${pickup.pickupId} moved to ${date}, ${slot}.`,
      link: `/collector/pickups/${pickup.pickupId}`,
      channels: ['inapp', 'push'],
    });
  }
  return pickup;
}

module.exports = {
  PickupActionError,
  ownershipFilter,
  findOwnedPickup,
  cancelCustomerPickup,
  rescheduleCustomerPickup,
  validateSlot,
  releaseCoupon,
};
