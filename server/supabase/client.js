const { createClient } = require('@supabase/supabase-js');

const centralUrl = process.env.CENTRAL_SUPABASE_URL;
const centralServiceKey = process.env.CENTRAL_SUPABASE_SERVICE_KEY;

if (!centralUrl || !centralServiceKey) {
  console.error('[Supabase] Missing CENTRAL_SUPABASE_URL or CENTRAL_SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

// Central admin client (service role)
const centralAdmin = createClient(centralUrl, centralServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Central public client (anon)
const centralPublic = createClient(centralUrl, process.env.CENTRAL_SUPABASE_ANON_KEY || 'public-key-missing', {
  auth: { autoRefreshToken: false, persistSession: false },
});

function createShopClient(shopUrl, shopServiceKey) {
  if (!shopUrl || !shopServiceKey) {
    throw new Error('Shop credentials missing. Please check shop configuration.');
  }
  return createClient(shopUrl, shopServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

module.exports = {
  centralAdmin,
  centralPublic,
  createShopClient,
};
