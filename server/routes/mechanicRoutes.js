const express = require('express');
const { createShopClient } = require('../supabase/client');
const { requireRole } = require('../utils/auth');
const licenseGuard = require('../middleware/licenseGuard');
const { centralAdmin } = require('../supabase/client');
const messaging = require('../utils/messaging');

const router = express.Router();
router.use(requireRole('mechanic'), licenseGuard);

function getShopClient(req) {
  const { shop_url, shop_service_key } = req.user;
  if (!shop_url || !shop_service_key) {
    throw new Error('Shop credentials missing. Please log out and log in again.');
  }
  return createShopClient(shop_url, shop_service_key);
}

// ---- GET mechanic profile ----
router.get('/me', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { data: mech, error } = await shopClient
      .from('mechanics')
      .select('id, name, mechanic_code, phone, years_experience')
      .eq('id', req.user.mechanic_id)
      .single();
    if (error) throw error;
    res.json(mech);
  } catch (err) {
    console.error('[mechanic/me] Error:', err);
    res.status(500).json({ error: 'Failed to fetch mechanic profile.' });
  }
});

// ---- GET jobs ----
router.get('/jobs', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { data: jobs, error } = await shopClient
      .from('jobs')
      .select('*')
      .eq('shop_id', req.user.shop_id)
      .eq('mechanic_id', req.user.mechanic_id)
      .not('status', 'eq', 'delivered')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(jobs || []);
  } catch (err) {
    console.error('[mechanic/jobs] Error:', err);
    res.status(500).json({ error: 'Failed to fetch jobs.' });
  }
});

// ---- CREATE job (mechanic adds job, auto-assigned) ----
router.post('/jobs', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const { customer_name, phone_number, bike_model, bike_number, complaints, amount } = req.body;

    if (!customer_name || !phone_number || !bike_model || !bike_number) {
      return res.status(400).json({ error: 'Customer name, phone, bike model and bike number are required.' });
    }

    const { count } = await shopClient
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', req.user.shop_id);
    const order_number = `JOB-${String((count || 0) + 1).padStart(4, '0')}`;

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
        mechanic_id: req.user.mechanic_id,
        amount: amount || 0,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    // Fetch shop Twilio credentials
    const { data: shop } = await centralAdmin
      .from('shops')
      .select('twilio_account_sid, twilio_auth_token, twilio_sms_number')
      .eq('id', req.user.shop_id)
      .single();

    await messaging.notifyStatusChange(job, shop, 'sms');
    res.json(job);
  } catch (err) {
    console.error('[mechanic/jobs/POST] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to create job' });
  }
});

// ---- UPDATE job ----
router.patch('/jobs/:id', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const jobId = req.params.id;

    const { data: job, error: fetchError } = await shopClient
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('shop_id', req.user.shop_id)
      .eq('mechanic_id', req.user.mechanic_id)
      .single();

    if (fetchError || !job) {
      return res.status(404).json({ error: 'Job not found or not assigned to you.' });
    }

    const updates = {};
    if (req.body.complaints) updates.complaints = req.body.complaints;
    if (req.body.status) updates.status = req.body.status;
    if (req.body.amount !== undefined) updates.amount = req.body.amount;
    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await shopClient
      .from('jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;

    if (req.body.status && req.body.status !== job.status) {
      const { data: shop } = await centralAdmin
        .from('shops')
        .select('twilio_account_sid, twilio_auth_token, twilio_sms_number')
        .eq('id', req.user.shop_id)
        .single();
      await messaging.notifyStatusChange(updated, shop, 'sms');
    }

    res.json(updated);
  } catch (err) {
    console.error('[mechanic/jobs/PATCH] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to update job' });
  }
});

// ---- Mark attendance ----
router.post('/attendance/mark', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const today = new Date().toISOString().slice(0, 10);
    const time = new Date().toTimeString().slice(0, 5);
    const { action } = req.body;

    if (!action || !['check_in', 'check_out'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "check_in" or "check_out".' });
    }

    const { data: existing, error: fetchError } = await shopClient
      .from('attendance')
      .select('*')
      .eq('mechanic_id', req.user.mechanic_id)
      .eq('date', today)
      .maybeSingle();

    if (fetchError) throw fetchError;

    let result;

    if (!existing) {
      if (action === 'check_out') {
        return res.status(400).json({ error: 'You must check in first.' });
      }
      const { data, error } = await shopClient
        .from('attendance')
        .insert({
          shop_id: req.user.shop_id,
          mechanic_id: req.user.mechanic_id,
          date: today,
          status: 'present',
          check_in: time,
          check_out: null,
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      if (action === 'check_in') {
        if (existing.check_in) {
          return res.status(400).json({ error: 'You are already checked in.' });
        }
        const { data, error } = await shopClient
          .from('attendance')
          .update({ check_in: time, status: 'present' })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        if (!existing.check_in) {
          return res.status(400).json({ error: 'You must check in first.' });
        }
        if (existing.check_out) {
          return res.status(400).json({ error: 'You already checked out today.' });
        }
        const { data, error } = await shopClient
          .from('attendance')
          .update({ check_out: time })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
    }

    res.json(result);
  } catch (err) {
    console.error('[mechanic/attendance/mark] Error:', err);
    res.status(500).json({ error: 'Failed to update attendance.' });
  }
});

// ---- GET today's attendance ----
router.get('/attendance/today', async (req, res) => {
  try {
    const shopClient = getShopClient(req);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await shopClient
      .from('attendance')
      .select('*')
      .eq('mechanic_id', req.user.mechanic_id)
      .eq('date', today)
      .maybeSingle();
    if (error) throw error;
    res.json(data || null);
  } catch (err) {
    console.error('[mechanic/attendance/today] Error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance.' });
  }
});

module.exports = router;