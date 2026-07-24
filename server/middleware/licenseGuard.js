const { centralAdmin } = require('../supabase/client');

async function licenseGuard(req, res, next) {
  const shopId = req.user.shop_id;
  if (!shopId) return res.status(403).json({ error: 'No shop context.' });

  const { data: shop, error } = await centralAdmin
    .from('shops')
    .select('license_status, license_expires_at')
    .eq('id', shopId)
    .single();

  if (error || !shop) return res.status(403).json({ error: 'Shop not found.' });

  const now = new Date();
  const expiry = shop.license_expires_at ? new Date(shop.license_expires_at) : null;
  const expired = !expiry || expiry < now || shop.license_status === 'revoked';

  if (expired) {
    if (shop.license_status !== 'revoked') {
      await centralAdmin.from('shops').update({ license_status: 'expired' }).eq('id', shopId);
    }
    return res.status(402).json({
      error: 'LICENSE_EXPIRED',
      message: 'This shop\'s license has expired. Please contact your software provider to renew.',
    });
  }
  next();
}

module.exports = licenseGuard;