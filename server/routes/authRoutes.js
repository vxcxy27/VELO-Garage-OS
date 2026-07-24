const express = require('express');
const bcrypt = require('bcryptjs');
const { centralAdmin } = require('../supabase/client');
const { createShopClient } = require('../supabase/client');
const { issueToken } = require('../utils/auth');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 12 * 60 * 60 * 1000,
  path: '/',
};

// ---- Admin login ----
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  const { data: admin, error } = await centralAdmin
    .from('super_admins')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = issueToken({ role: 'admin', id: admin.id, name: admin.name });
  res.cookie('token_admin', token, COOKIE_OPTS);
  res.json({ ok: true, name: admin.name });
});

// ---- Shop owner login ----
router.post('/shop/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { data: shop, error } = await centralAdmin
    .from('shops')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !shop) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (!bcrypt.compareSync(password || '', shop.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (!shop.supabase_url || !shop.supabase_service_key) {
    return res.status(500).json({ error: 'Shop configuration error. Please contact support.' });
  }

  const token = issueToken({
    role: 'owner',
    shop_id: shop.id,
    shop_name: shop.shop_name,
    owner_name: shop.owner_name,
    shop_url: shop.supabase_url,
    shop_service_key: shop.supabase_service_key,
  });

  res.cookie('token_owner', token, COOKIE_OPTS);
  res.json({
    ok: true,
    shop_name: shop.shop_name,
    license_status: shop.license_status,
    license_expires_at: shop.license_expires_at,
  });
});

// ---- Mechanic login ----
router.post('/mechanic/login', async (req, res) => {
  const { email, mechanic_code, name } = req.body;

  if (!email || !mechanic_code || !name) {
    return res.status(400).json({ error: 'Shop email, mechanic ID, and name are required.' });
  }

  const { data: shop, error: shopError } = await centralAdmin
    .from('shops')
    .select('id, supabase_url, supabase_service_key, license_status, license_expires_at')
    .eq('email', email)
    .single();

  if (shopError || !shop) {
    return res.status(401).json({ error: 'Invalid shop email. Please check with your shop owner.' });
  }

  const shopClient = createShopClient(shop.supabase_url, shop.supabase_service_key);

  const { data: mechanic, error: mechError } = await shopClient
    .from('mechanics')
    .select('*')
    .eq('mechanic_code', mechanic_code.trim())
    .eq('active', true)
    .maybeSingle();

  if (mechError || !mechanic) {
    return res.status(401).json({ error: 'Invalid mechanic ID. Please check with your shop owner.' });
  }

  if (mechanic.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
    return res.status(401).json({ error: 'Invalid name. Please check with your shop owner.' });
  }

  const token = issueToken({
    role: 'mechanic',
    shop_id: shop.id,
    mechanic_id: mechanic.id,
    name: mechanic.name,
    shop_url: shop.supabase_url,
    shop_service_key: shop.supabase_service_key,
  });

  res.cookie('token_mechanic', token, COOKIE_OPTS);
  res.json({ ok: true, name: mechanic.name, mechanic_code: mechanic.mechanic_code });
});

// ---- Logout ----
router.post('/logout/:role', (req, res) => {
  res.clearCookie(`token_${req.params.role}`);
  res.json({ ok: true });
});

module.exports = router;