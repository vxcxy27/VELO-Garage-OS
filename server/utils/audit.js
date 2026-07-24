const { centralAdmin } = require('../supabase/client');

async function logAudit(event, userId, userRole, shopId, details, ip, userAgent) {
  try {
    await centralAdmin
      .from('audit_logs')
      .insert({
        event,
        user_id: userId,
        user_role: userRole,
        shop_id: shopId,
        details: JSON.stringify(details),
        ip_address: ip,
        user_agent: userAgent,
        created_at: new Date().toISOString(),
      });
  } catch (err) {
    console.error('[Audit] Failed to log:', err);
  }
}

// Create audit logs table in central DB
async function createAuditTable() {
  await centralAdmin.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      event TEXT NOT NULL,
      user_id UUID,
      user_role TEXT,
      shop_id UUID,
      details JSONB,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}

module.exports = { logAudit, createAuditTable };