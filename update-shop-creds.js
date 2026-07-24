require('dotenv').config();
const { centralAdmin } = require('./server/supabase/client');
const { encrypt } = require('./server/utils/encryption');

async function updateShop() {
  const email = 'your-shop-email@example.com'; // Change to your shop email
  const supabaseUrl = 'https://your-shop-project.supabase.co';
  const supabaseAnonKey = 'your-anon-key';
  const supabaseServiceKey = 'your-service-key';

  const encryptedAnon = encrypt(supabaseAnonKey);
  const encryptedService = encrypt(supabaseServiceKey);

  const { error } = await centralAdmin
    .from('shops')
    .update({
      supabase_url: supabaseUrl,
      supabase_anon_key: encryptedAnon,
      supabase_service_key: encryptedService,
    })
    .eq('email', email);

  if (error) {
    console.error('Failed to update shop:', error);
  } else {
    console.log('✅ Shop credentials updated successfully.');
  }
}

updateShop();