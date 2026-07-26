const express = require('express');
const ExcelJS = require('exceljs');
const { centralAdmin } = require('../supabase/client');
const { createShopClient } = require('../supabase/client');
const { requireRole } = require('../utils/auth');
const licenseGuard = require('../middleware/licenseGuard');
const { OVERLOAD_THRESHOLD } = require('../utils/workload');
const messaging = require('../utils/messaging');

const router = express.Router();
router.use(requireRole('owner'), licenseGuard);

function getShopClient(req) {
  const { shop_url, shop_service_key } = req.user;
  if (!shop_url || !shop_service_key) {
    throw new Error('Shop credentials missing. Please log out and log in again.');
  }
  return createShopClient(shop_url, shop_service_key);
}

async function nextOrderNumber(shopClient, shopId) {
  const { count, error } = await shopClient
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId);
  if (error) throw error;
  return `JOB-${String((count || 0) + 1).padStart(4, '0')}`;
}

async function nextMechanicCode(shopClient, shopId) {
  const { count, error } = await shopClient
    .from('mechanics')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId);
  if (error) throw error;
  return `MEC${(count || 0) + 1}`;
}

// ---- GET all jobs ----
router.get('/jobs', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { data: jobs, error } = await shopClient
      .from('jobs')
      .select(`*, mechanics!left (name, mechanic_code)`)
      .eq('shop_id', req.user.shop_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(jobs || []);
  } catch (err) {
    console.error('[shop/jobs] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch jobs' });
  }
});

// ---- CREATE job ----
router.post('/jobs', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { customer_name, phone_number, bike_model, bike_number, complaints, mechanic_id, amount } = req.body;

    if (!customer_name || !phone_number || !bike_model || !bike_number) {
      return res.status(400).json({ error: 'Customer name, phone, bike model and bike number are required.' });
    }

    const mechanicIdFinal = mechanic_id && mechanic_id.trim() !== '' ? mechanic_id : null;

    if (mechanicIdFinal) {
      const { data: mechanic, error: mechCheck } = await shopClient
        .from('mechanics')
        .select('id')
        .eq('id', mechanicIdFinal)
        .eq('active', true)
        .single();
      if (mechCheck || !mechanic) {
        return res.status(400).json({ error: 'Selected mechanic is invalid or inactive.' });
      }
    }

    const order_number = await nextOrderNumber(shopClient, req.user.shop_id);
    const complaintList = (complaints || []).map(c => ({ text: c.text || c, done: c.done || false }));

    const { data: job, error } = await shopClient
      .from('jobs')
      .insert({
        shop_id: req.user.shop_id,
        order_number,
        customer_name,
        phone_number,
        bike_model,
        bike_number,
        complaints: complaintList,
        mechanic_id: mechanicIdFinal,
        amount: amount || 0,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    // ----- FETCH SHOP TWILIO CREDENTIALS -----
    const { data: shop, error: shopError } = await centralAdmin
      .from('shops')
      .select('twilio_account_sid, twilio_auth_token, twilio_sms_number')
      .eq('id', req.user.shop_id)
      .single();

    console.log('[DEBUG] Shop Twilio fetch result:', {
      shopError: shopError ? shopError.message : 'none',
      hasShop: !!shop,
      hasSid: !!shop?.twilio_account_sid,
      hasToken: !!shop?.twilio_auth_token,
      hasNumber: !!shop?.twilio_sms_number,
    });

    // Send SMS notification to customer
    await messaging.notifyStatusChange(job, shop, 'sms');

    // If mechanic assigned, notify mechanic
    if (mechanicIdFinal) {
      const { data: mechanic } = await shopClient.from('mechanics').select('*').eq('id', mechanicIdFinal).single();
      if (mechanic) {
        await messaging.notifyMechanicJobAssigned(job, mechanic, shop);
      }
    }

    res.json(job);
  } catch (err) {
    console.error('[shop/jobs/POST] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to create job' });
  }
});

// ---- UPDATE job ----
router.patch('/jobs/:id', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const jobId = req.params.id;

    const { data: existingJob, error: fetchError } = await shopClient
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('shop_id', req.user.shop_id)
      .single();

    if (fetchError || !existingJob) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const updates = {};
    const fields = ['customer_name', 'phone_number', 'bike_model', 'bike_number', 'status', 'amount'];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    if (req.body.mechanic_id !== undefined) {
      updates.mechanic_id = req.body.mechanic_id && req.body.mechanic_id.trim() !== '' ? req.body.mechanic_id : null;
    }

    if (req.body.complaints) updates.complaints = req.body.complaints;
    updates.updated_at = new Date().toISOString();

    if (updates.mechanic_id) {
      const { data: mechanic, error: mechCheck } = await shopClient
        .from('mechanics')
        .select('id')
        .eq('id', updates.mechanic_id)
        .eq('active', true)
        .single();
      if (mechCheck || !mechanic) {
        return res.status(400).json({ error: 'Selected mechanic is invalid or inactive.' });
      }
    }

    const { data: updated, error } = await shopClient
      .from('jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;

    // ----- FETCH SHOP TWILIO CREDENTIALS -----
    const { data: shop, error: shopError } = await centralAdmin
      .from('shops')
      .select('twilio_account_sid, twilio_auth_token, twilio_sms_number')
      .eq('id', req.user.shop_id)
      .single();

    console.log('[DEBUG] Shop Twilio fetch (PATCH):', {
      shopError: shopError ? shopError.message : 'none',
      hasShop: !!shop,
      hasSid: !!shop?.twilio_account_sid,
      hasToken: !!shop?.twilio_auth_token,
      hasNumber: !!shop?.twilio_sms_number,
    });

    if (req.body.status && req.body.status !== existingJob.status) {
      await messaging.notifyStatusChange(updated, shop, 'sms');
    }

    if (req.body.mechanic_id !== undefined && req.body.mechanic_id !== existingJob.mechanic_id) {
      const finalMechId = updates.mechanic_id;
      if (finalMechId) {
        const { data: mechanic } = await shopClient.from('mechanics').select('*').eq('id', finalMechId).single();
        if (mechanic) {
          await messaging.notifyMechanicJobAssigned(updated, mechanic, shop);
        }
      }
    }

    res.json(updated);
  } catch (err) {
    console.error('[shop/jobs/PATCH] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to update job' });
  }
});

// ---- DELETE job ----
router.delete('/jobs/:id', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { error } = await shopClient.from('jobs').delete().eq('id', req.params.id).eq('shop_id', req.user.shop_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[shop/jobs/DELETE] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete job' });
  }
});

// ---- GET mechanics ----
router.get('/mechanics', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { data: mechanics, error } = await shopClient
      .from('mechanics')
      .select('*')
      .eq('shop_id', req.user.shop_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(mechanics || []);
  } catch (err) {
    console.error('[shop/mechanics] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch mechanics' });
  }
});

// ---- CREATE mechanic ----
router.post('/mechanics', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { name, phone, years_experience, specialization, emergency_contact, address, email } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Mechanic name and phone are required.' });
    }

    const mechanic_code = await nextMechanicCode(shopClient, req.user.shop_id);

    const { data: mechanic, error } = await shopClient
      .from('mechanics')
      .insert({
        shop_id: req.user.shop_id,
        mechanic_code,
        name,
        phone,
        years_experience: years_experience || 0,
        specialization: specialization || '',
        emergency_contact: emergency_contact || '',
        address: address || '',
        email: email || '',
        active: true,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(mechanic);
  } catch (err) {
    console.error('[shop/mechanics/POST] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to create mechanic' });
  }
});

// ---- UPDATE mechanic ----
router.patch('/mechanics/:id', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { name, phone, years_experience, active, specialization, emergency_contact, address, email } = req.body;

    const { data: mechanic, error } = await shopClient
      .from('mechanics')
      .update({
        name: name || undefined,
        phone: phone || undefined,
        years_experience: years_experience !== undefined ? years_experience : undefined,
        active: active !== undefined ? active : undefined,
        specialization: specialization !== undefined ? specialization : undefined,
        emergency_contact: emergency_contact !== undefined ? emergency_contact : undefined,
        address: address !== undefined ? address : undefined,
        email: email !== undefined ? email : undefined,
      })
      .eq('id', req.params.id)
      .eq('shop_id', req.user.shop_id)
      .select()
      .single();

    if (error) throw error;
    res.json(mechanic);
  } catch (err) {
    console.error('[shop/mechanics/PATCH] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to update mechanic' });
  }
});

// ---- GET attendance ----
router.get('/attendance', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { date, mechanic_id } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    let query = shopClient
      .from('mechanics')
      .select(`id, name, mechanic_code, attendance!left (id, date, check_in, check_out, status)`)
      .eq('shop_id', req.user.shop_id)
      .eq('active', true);

    if (mechanic_id) query = query.eq('id', mechanic_id);

    const { data: mechanics, error } = await query;
    if (error) throw error;

    const result = mechanics.map(m => {
      const attendance = m.attendance?.find(a => a.date === targetDate) || {};
      return {
        id: m.id,
        name: m.name,
        mechanic_code: m.mechanic_code,
        date: targetDate,
        check_in: attendance.check_in || null,
        check_out: attendance.check_out || null,
        status: attendance.status || 'absent',
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[shop/attendance] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch attendance' });
  }
});

// ---- POST attendance ----
router.post('/attendance', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { mechanic_id, date, status, check_in, check_out } = req.body;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const { error } = await shopClient
      .from('attendance')
      .upsert({
        shop_id: req.user.shop_id,
        mechanic_id,
        date: targetDate,
        status: status || 'present',
        check_in: check_in || null,
        check_out: check_out || null,
      }, { onConflict: 'mechanic_id,date' });

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[shop/attendance/POST] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to update attendance' });
  }
});

// ---- GET attendance history ----
router.get('/attendance/history/:mechanicId', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { mechanicId } = req.params;

    const { data: attendance, error } = await shopClient
      .from('attendance')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .eq('shop_id', req.user.shop_id)
      .order('date', { ascending: false })
      .limit(30);

    if (error) throw error;
    res.json(attendance || []);
  } catch (err) {
    console.error('[shop/attendance/history] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch attendance history' });
  }
});

// ---- GET sales monthly ----
router.get('/sales/monthly', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { data: sales, error } = await shopClient
      .from('jobs')
      .select('created_at, amount')
      .eq('shop_id', req.user.shop_id)
      .in('status', ['completed', 'delivered'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    const monthly = {};
    (sales || []).forEach(job => {
      const month = job.created_at.slice(0, 7);
      if (!monthly[month]) monthly[month] = 0;
      monthly[month] += job.amount || 0;
    });

    const result = Object.entries(monthly).map(([month, total]) => ({ month, total }));
    res.json(result);
  } catch (err) {
    console.error('[shop/sales/monthly] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch sales' });
  }
});

// ---- GET shop info (including Twilio credentials) ----
router.get('/me', async (req, res) => {
  try {
    const { data: shop, error } = await centralAdmin
      .from('shops')
      .select('id, shop_name, owner_name, email, phone, location, license_status, license_expires_at, twilio_account_sid, twilio_auth_token, twilio_sms_number')
      .eq('id', req.user.shop_id)
      .single();

    if (error) throw error;
    res.json(shop);
  } catch (err) {
    console.error('[shop/me] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch shop info' });
  }
});

// ---- UPDATE shop settings (including Twilio credentials) ----
router.patch('/settings', async (req, res) => {
  try {
    const {
      shop_name, owner_name, phone, location,
      twilio_account_sid, twilio_auth_token, twilio_sms_number,
    } = req.body;

    const { data: shop, error } = await centralAdmin
      .from('shops')
      .update({
        shop_name: shop_name || undefined,
        owner_name: owner_name || undefined,
        phone: phone || undefined,
        location: location || undefined,
        twilio_account_sid: twilio_account_sid || undefined,
        twilio_auth_token: twilio_auth_token || undefined,
        twilio_sms_number: twilio_sms_number || undefined,
      })
      .eq('id', req.user.shop_id)
      .select('id, shop_name, owner_name, email, phone, location, twilio_account_sid, twilio_auth_token, twilio_sms_number')
      .single();

    if (error) throw error;
    res.json(shop);
  } catch (err) {
    console.error('[shop/settings/PATCH] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to update settings' });
  }
});

// ---- GET dashboard stats ----
router.get('/dashboard', async (req, res) => {
  try {
    const shopClient = getShopClient(req);

    const { data: shop } = await centralAdmin
      .from('shops')
      .select('shop_name, owner_name, license_status, license_expires_at')
      .eq('id', req.user.shop_id)
      .single();

    const { data: jobs } = await shopClient.from('jobs').select('status, amount').eq('shop_id', req.user.shop_id);
    const { count: mechanicCount } = await shopClient
      .from('mechanics')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', req.user.shop_id)
      .eq('active', true);

    const totalJobs = jobs?.length || 0;
    const completedJobs = jobs?.filter(j => j.status === 'completed' || j.status === 'delivered').length || 0;
    const totalRevenue = jobs?.filter(j => j.status === 'completed' || j.status === 'delivered')
      .reduce((sum, j) => sum + (j.amount || 0), 0) || 0;

    res.json({
      shop,
      jobs: { total: totalJobs, completed: completedJobs },
      revenue: { total: totalRevenue },
      mechanics: { active: mechanicCount || 0 },
    });
  } catch (err) {
    console.error('[shop/dashboard] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch dashboard stats' });
  }
});

// ---- Export sales ----
router.get('/sales/export', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { data: jobs, error } = await shopClient
      .from('jobs')
      .select('order_number, customer_name, bike_model, bike_number, amount, status, created_at')
      .eq('shop_id', req.user.shop_id)
      .in('status', ['completed', 'delivered'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Completed Jobs');
    sheet.columns = [
      { header: 'Order #', key: 'order_number', width: 14 },
      { header: 'Customer', key: 'customer_name', width: 22 },
      { header: 'Bike Model', key: 'bike_model', width: 18 },
      { header: 'Bike Number', key: 'bike_number', width: 16 },
      { header: 'Amount (₹)', key: 'amount', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Completed At', key: 'created_at', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };
    (jobs || []).forEach((r) => sheet.addRow(r));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="completed-jobs-export.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[shop/sales/export] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to export sales' });
  }
});

// ---- Workload helpers ----
async function getMechanicScore(shopClient, shopId, mechanicId) {
  const { data: jobs } = await shopClient
    .from('jobs')
    .select('status')
    .eq('shop_id', shopId)
    .eq('mechanic_id', mechanicId)
    .not('status', 'in', ['completed', 'delivered']);

  const weights = { in_progress: 3, pending: 1.5, on_hold: 0.5 };
  let score = 0;
  const counts = { in_progress: 0, pending: 0, on_hold: 0 };
  (jobs || []).forEach(j => {
    if (weights[j.status]) {
      score += weights[j.status];
      counts[j.status] = (counts[j.status] || 0) + 1;
    }
  });

  const { data: mech } = await shopClient.from('mechanics').select('years_experience').eq('id', mechanicId).single();
  const experienceFactor = mech ? Math.max(0.75, 1 - Math.min(mech.years_experience, 10) * 0.02) : 1;
  score = score * experienceFactor;

  return {
    mechanicId,
    score: Math.round(score * 10) / 10,
    counts,
    overloaded: score >= OVERLOAD_THRESHOLD,
  };
}

async function getWorkloadReport(shopClient, shopId) {
  const { data: mechanics } = await shopClient
    .from('mechanics')
    .select('id, name, mechanic_code')
    .eq('shop_id', shopId)
    .eq('active', true);

  const results = [];
  for (const m of mechanics || []) {
    const score = await getMechanicScore(shopClient, shopId, m.id);
    results.push({ ...score, name: m.name, mechanic_code: m.mechanic_code });
  }
  results.sort((a, b) => b.score - a.score);
  return { threshold: OVERLOAD_THRESHOLD, mechanics: results };
}

// ---- Workload report ----
router.get('/workload-report', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const report = await getWorkloadReport(shopClient, req.user.shop_id);
    res.json(report);
  } catch (err) {
    console.error('[shop/workload-report] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch workload report' });
  }
});

// ---- Get mechanic workload ----
router.get('/mechanics/:id/workload', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const score = await getMechanicScore(shopClient, req.user.shop_id, req.params.id);
    res.json(score);
  } catch (err) {
    console.error('[shop/mechanics/workload] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch mechanic workload' });
  }
});

// ---- GET performance ----
router.get('/performance', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { data: mechanics, error } = await shopClient
      .from('mechanics')
      .select(`id, name, mechanic_code, jobs!left (status, amount)`)
      .eq('shop_id', req.user.shop_id)
      .eq('active', true);

    if (error) throw error;

    const performance = mechanics.map(m => {
      const jobs = m.jobs || [];
      const totalJobs = jobs.length;
      const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'delivered').length;
      const revenueGenerated = jobs
        .filter(j => j.status === 'completed' || j.status === 'delivered')
        .reduce((sum, j) => sum + (j.amount || 0), 0);

      return {
        id: m.id,
        name: m.name,
        mechanic_code: m.mechanic_code,
        total_jobs: totalJobs,
        completed_jobs: completedJobs,
        revenue_generated: revenueGenerated,
      };
    });

    performance.sort((a, b) => b.completed_jobs - a.completed_jobs);
    res.json(performance);
  } catch (err) {
    console.error('[shop/performance] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch performance data' });
  }
});

module.exports = router;