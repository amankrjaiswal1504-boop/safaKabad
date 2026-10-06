const Address = require('../models/Address');
const { checkAddress, resolveAddress, AddressError } = require('../services/cityService');

async function withServiceability(address) {
  const obj = address.toObject ? address.toObject() : address;
  const service = await checkAddress(obj);
  return { ...obj, serviceable: service.serviceable, serviceReason: service.reason };
}

const fail = (res, err) => res.status(err.status || 400).json({ success: false, message: err.message });

async function listAddresses(req, res, next) {
  try {
    const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 });
    res.json({ success: true, data: { addresses: await Promise.all(addresses.map(withServiceability)) } });
  } catch (err) {
    next(err);
  }
}

async function createAddress(req, res, next) {
  try {
    const count = await Address.countDocuments({ user: req.user._id });
    if (count >= 10) return res.status(400).json({ success: false, message: 'You can save up to 10 addresses' });
    const payload = { ...(await resolveAddress(req.body)), user: req.user._id };
    if (!count) payload.isDefault = true;
    if (payload.isDefault) await Address.updateMany({ user: req.user._id }, { $set: { isDefault: false } });
    const address = await Address.create(payload);
    res.status(201).json({ success: true, data: { address: await withServiceability(address) } });
  } catch (err) {
    if (err instanceof AddressError) return fail(res, err);
    next(err);
  }
}

async function updateAddress(req, res, next) {
  try {
    const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
    const updates = await resolveAddress(req.body, { partialOf: address.toObject() });
    if (updates.isDefault) await Address.updateMany({ user: req.user._id }, { $set: { isDefault: false } });
    Object.assign(address, updates);
    await address.save();
    res.json({ success: true, data: { address: await withServiceability(address) } });
  } catch (err) {
    if (err instanceof AddressError) return fail(res, err);
    next(err);
  }
}

async function deleteAddress(req, res, next) {
  try {
    const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
    if (address.isDefault) {
      const next1 = await Address.findOne({ user: req.user._id }).sort({ createdAt: -1 });
      if (next1) await Address.updateOne({ _id: next1._id }, { isDefault: true });
    }
    res.json({ success: true, message: 'Address deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAddresses, createAddress, updateAddress, deleteAddress };
