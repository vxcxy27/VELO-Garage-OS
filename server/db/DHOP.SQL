-- ============================================================
-- Shop Database Schema (for each shop's Supabase project)
-- ============================================================

-- Enable RLS
ALTER TABLE IF EXISTS mechanics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS attendance ENABLE ROW LEVEL SECURITY;

-- Mechanics
CREATE TABLE IF NOT EXISTS mechanics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID NOT NULL,
  mechanic_code TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  years_experience REAL DEFAULT 0,
  specialization TEXT DEFAULT '',
  emergency_contact TEXT DEFAULT '',
  address TEXT DEFAULT '',
  email TEXT DEFAULT '',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(shop_id, mechanic_code)
);

-- Jobs
CREATE TABLE IF NOT EXISTS jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID NOT NULL,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  bike_model TEXT NOT NULL,
  bike_number TEXT NOT NULL,
  complaints JSONB NOT NULL DEFAULT '[]',
  mechanic_id UUID REFERENCES mechanics(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  amount REAL DEFAULT 0,
  last_whatsapp_status TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(shop_id, order_number)
);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID NOT NULL,
  mechanic_id UUID NOT NULL REFERENCES mechanics(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  status TEXT DEFAULT 'present',
  UNIQUE(mechanic_id, date)
);

-- Indexes
CREATE INDEX idx_jobs_shop_id ON jobs(shop_id);
CREATE INDEX idx_jobs_mechanic_id ON jobs(mechanic_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_mechanics_shop_id ON mechanics(shop_id);
CREATE INDEX idx_attendance_mechanic_id ON attendance(mechanic_id);
CREATE INDEX idx_attendance_date ON attendance(date);

-- RLS Policies (service role only)
CREATE POLICY "Service role full access on mechanics" ON mechanics
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on jobs" ON jobs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on attendance" ON attendance
  FOR ALL USING (auth.role() = 'service_role');