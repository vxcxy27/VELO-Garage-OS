require('dotenv').config();
const bcrypt = require('bcryptjs');
const { centralAdmin } = require('../supabase/client');

const email = process.env.ADMIN_EMAIL || 'admin@yourcompany.com';
const password = process.env.ADMIN_PASSWORD || 'change_this_password';

async function seed() {
  try {
    const { data: existing, error: checkError } = await centralAdmin
      .from('super_admins')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (checkError) {
      console.error('[seed] Error checking for existing admin:', checkError.message);
      return;
    }

    if (existing) {
      console.log(`[seed] Super admin already exists for ${email} - nothing to do.`);
      return;
    }

    const hash = bcrypt.hashSync(password, 10);
    const { error: insertError } = await centralAdmin
      .from('super_admins')
      .insert({ email, password_hash: hash, name: 'Developer' });

    if (insertError) {
      console.error('[seed] Failed to create super admin:', insertError.message);
    } else {
      console.log(`[seed] Super admin created.\n  Login email: ${email}\n  Password: (as set in your .env)`);
    }
  } catch (err) {
    console.error('[seed] Failed:', err);
  }
}

seed();