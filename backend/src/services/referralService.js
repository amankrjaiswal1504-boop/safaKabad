const User = require('../models/User');
const Pickup = require('../models/Pickup');
const settings = require('./settingsService');
const wallet = require('./walletService');
const { notify } = require('./notificationService');
const logger = require('../utils/logger');

// Called after a pickup completes. On the referred customer's first completed
// pickup, both people get the referral reward in their wallets, exactly once.
async function rewardOnFirstPickup(customerId) {
  try {
    const cfg = await settings.get('referral');
    if (!cfg.enabled) return;
    const referee = await User.findById(customerId);
    if (!referee?.referredBy || referee.referralRewarded) return;
    const completed = await Pickup.countDocuments({ customer: customerId, status: 'COMPLETED' });
    if (completed !== 1) return;
    // Claim first so a retry can never pay twice.
    const claimed = await User.updateOne({ _id: referee._id, referralRewarded: false }, { referralRewarded: true });
    if (!claimed.modifiedCount) return;

    await wallet.withTransaction(async (session) => {
      if (cfg.refereeReward > 0) {
        await wallet.credit(referee._id, cfg.refereeReward, 'referral', { note: 'Welcome reward' }, session);
      }
      if (cfg.referrerReward > 0) {
        await wallet.credit(
          referee.referredBy,
          cfg.referrerReward,
          'referral',
          { reference: String(referee._id), note: `Referred ${referee.name}` },
          session
        );
      }
    });
    await notify(referee.referredBy, {
      type: 'referral.reward',
      title: 'Referral reward credited',
      body: `${referee.name.split(' ')[0]} completed their first pickup. Rs. ${cfg.referrerReward} added to your wallet.`,
      link: '/wallet',
      channels: ['inapp', 'push', 'whatsapp'],
    });
  } catch (err) {
    logger.error({ err: err.message }, 'referral reward failed');
  }
}

async function leaderboard(limit = 10) {
  const rows = await User.aggregate([
    { $match: { referredBy: { $ne: null }, referralRewarded: true } },
    { $group: { _id: '$referredBy', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $project: { count: 1, name: '$user.name' } },
  ]);
  // Public view shows first name + last initial only.
  return rows.map((r, i) => {
    const [first, last] = r.name.split(' ');
    return { rank: i + 1, name: `${first}${last ? ` ${last[0]}.` : ''}`, referrals: r.count };
  });
}

module.exports = { rewardOnFirstPickup, leaderboard };
