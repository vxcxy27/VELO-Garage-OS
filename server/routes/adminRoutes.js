const express = require('express');
const bcrypt = require('bcryptjs');
const { centralAdmin } = require('../supabase/client');
const { requireRole } = require('../utils/auth');
const { generateLicense, daysUntil } = require('../utils/license');

const router = express.Router();
router.use(requireRole('admin'));

// ---- GET all shops ----
router.get('/shops', async (req, res) => {
  try {
    const { data: shops, error } = await centralAdmin
      .from('shops')
      .select('id, shop_name, owner_name, email, phone, location, license_status, license_expires_at, supabase_credits, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const withMeta = (shops || []).map(shop => ({
      ...shop,
      days_remaining: shop.license_expires_at ? daysUntil(shop.license_expires_at) : null,
    }));

    res.json(withMeta);
  } catch (err) {
    console.error('[admin/shops] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch shops' });
  }
});

// ---- CREATE shop ----
router.post('/shops', async (req, res) => {
  try {
    const {
      shop_name, owner_name, email, phone, location,
      password, months, supabase_credits,
      supabase_url, supabase_anon_key, supabase_service_key,
    } = req.body;

    if (!shop_name || !owner_name || !email || !phone || !password ||
        !supabase_url || !supabase_anon_key || !supabase_service_key) {
      return res.status(400).json({ error: 'All fields are required including Supabase credentials.' });
    }

    const password_hash = bcrypt.hashSync(password, 10);

    const { data: shop, error } = await centralAdmin
      .from('shops')
      .insert({
        shop_name,
        owner_name,
        email,
        phone,
        location: location || '',
        password_hash,
        supabase_url,
        supabase_anon_key,
        supabase_service_key,
        supabase_credits: supabase_credits || 0,
        license_months: months || 1,
        license_status: 'inactive',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A shop with this email already exists.' });
      }
      throw error;
    }

    if (months) {
      const lic = generateLicense(shop.id, months);
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + Number(months));

      await centralAdmin
        .from('shops')
        .update({
          license_key: lic.licenseKey,
          license_issued_at: new Date().toISOString(),
          license_expires_at: expiresAt.toISOString(),
          license_status: 'active',
        })
        .eq('id', shop.id);

      await centralAdmin
        .from('license_history')
        .insert({
          shop_id: shop.id,
          license_key: lic.licenseKey,
          months: months,
          expires_at: expiresAt.toISOString(),
          action: 'issued',
        });
    }

    const { data: updatedShop } = await centralAdmin
      .from('shops')
      .select('id, shop_name, owner_name, email, phone, location, license_status, license_expires_at, supabase_credits, created_at')
      .eq('id', shop.id)
      .single();

    res.json({
      ...updatedShop,
      days_remaining: updatedShop.license_expires_at ? daysUntil(updatedShop.license_expires_at) : null,
    });
  } catch (err) {
    console.error('[admin/shops/POST] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to create shop' });
  }
});

// ---- REVOKE license ----
router.post('/shops/:id/revoke', async (req, res) => {
  try {
    const { data: shop, error: fetchError } = await centralAdmin
      .from('shops')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !shop) {
      return res.status(404).json({ error: 'Shop not found.' });
    }

    await centralAdmin.from('shops').update({ license_status: 'revoked' }).eq('id', shop.id);

    await centralAdmin
      .from('license_history')
      .insert({
        shop_id: shop.id,
        license_key: shop.license_key || 'N/A',
        months: 0,
        expires_at: new Date().toISOString(),
        action: 'revoked',
      });

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/revoke] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to revoke license' });
  }
});

// ---- RENEW license ----
router.post('/shops/:id/license/renew', async (req, res) => {
  try {
    const { months } = req.body;
    if (![1, 3, 6, 12].includes(Number(months))) {
      return res.status(400).json({ error: 'Months must be one of 1, 3, 6, 12.' });
    }

    const { data: shop, error: fetchError } = await centralAdmin
      .from('shops')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !shop) {
      return res.status(404).json({ error: 'Shop not found.' });
    }

    const daysLeft = shop.license_expires_at ? daysUntil(shop.license_expires_at) : -1;
    if (daysLeft > 14) {
      return res.status(409).json({
        error: `This shop's license is still active for ${daysLeft} more day(s).`,
      });
    }

    const base = shop.license_expires_at && new Date(shop.license_expires_at) > new Date()
      ? new Date(shop.license_expires_at)
      : new Date();

    const lic = generateLicense(shop.id, months);
    const expiresAt = new Date(base);
    expiresAt.setMonth(expiresAt.getMonth() + Number(months));

    await centralAdmin
      .from('shops')
      .update({
        license_key: lic.licenseKey,
        license_months: months,
        license_issued_at: new Date().toISOString(),
        license_expires_at: expiresAt.toISOString(),
        license_status: 'active',
      })
      .eq('id', shop.id);

    await centralAdmin
      .from('license_history')
      .insert({
        shop_id: shop.id,
        license_key: lic.licenseKey,
        months: months,
        expires_at: expiresAt.toISOString(),
        action: 'renewed',
      });

    const { data: updatedShop } = await centralAdmin
      .from('shops')
      .select('id, shop_name, owner_name, email, phone, location, license_status, license_expires_at, supabase_credits, created_at')
      .eq('id', shop.id)
      .single();

    res.json({
      ...updatedShop,
      days_remaining: updatedShop.license_expires_at ? daysUntil(updatedShop.license_expires_at) : null,
    });
  } catch (err) {
    console.error('[admin/renew] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to renew license' });
  }
});

// ---- GET licenses expiring ----
router.get('/licenses/expiring', async (req, res) => {
  try {
    const { data: shops, error } = await centralAdmin
      .from('shops')
      .select('*')
      .not('license_expires_at', 'is', null)
      .order('license_expires_at', { ascending: true });

    if (error) throw error;

    const withMeta = (shops || []).map(shop => ({
      ...shop,
      days_remaining: shop.license_expires_at ? daysUntil(shop.license_expires_at) : null,
    }));

    res.json({
      expired: withMeta.filter((s) => s.days_remaining !== null && s.days_remaining < 0),
      expiring_soon: withMeta.filter((s) => s.days_remaining !== null && s.days_remaining >= 0 && s.days_remaining <= 14),
      healthy: withMeta.filter((s) => s.days_remaining !== null && s.days_remaining > 14),
    });
  } catch (err) {
    console.error('[admin/licenses/expiring] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch licenses' });
  }
});

// ---- GET summary ----
router.get('/summary', async (req, res) => {
  try {
    const { data: shops } = await centralAdmin.from('shops').select('license_status, license_expires_at');

    const totalShops = shops?.length || 0;
    const activeShops = shops?.filter(s => s.license_status === 'active').length || 0;
    const expired = shops?.filter(s => s.license_status === 'expired').length || 0;

    const expiringSoon = shops?.filter(s => {
      if (s.license_status !== 'active' || !s.license_expires_at) return false;
      const days = daysUntil(s.license_expires_at);
      return days >= 0 && days <= 14;
    }).length || 0;

    res.json({ totalShops, activeShops, expiringSoon, expired });
  } catch (err) {
    console.error('[admin/summary] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch summary' });
  }
});

module.exports = router;