-- ============================================================
-- Central Database Schema (your admin Supabase project)
-- ============================================================

-- Super Admins
CREATE TABLE IF NOT EXISTS super_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shops
CREATE TABLE IF NOT EXISTS shops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  location TEXT,
  password_hash TEXT NOT NULL,
  supabase_url TEXT NOT NULL,
  supabase_anon_key TEXT NOT NULL,
  supabase_service_key TEXT NOT NULL,
  supabase_credits INTEGER DEFAULT 0,
  license_key TEXT UNIQUE,
  license_months INTEGER DEFAULT 1,
  license_issued_at TIMESTAMP WITH TIME ZONE,
  license_expires_at TIMESTAMP WITH TIME ZONE,
  license_status TEXT DEFAULT 'inactive',
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_whatsapp_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- License History
CREATE TABLE IF NOT EXISTS license_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  license_key TEXT NOT NULL,
  months INTEGER NOT NULL,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  action TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_shops_email ON shops(email);
CREATE INDEX idx_shops_license_status ON shops(license_status);
CREATE INDEX idx_license_history_shop_id ON license_history(shop_id);