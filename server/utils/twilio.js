// ============================================================
// Twilio WhatsApp Utility – Per‑Shop Credentials
// ============================================================

const twilio = require('twilio');

// Global client (fallback if no shop credentials)
let defaultClient = null;

/**
 * Initialize the default Twilio client from environment variables.
 * Call this once at server startup.
 */
function init() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
    console.warn('[twilio] ⚠️ Global Twilio credentials not set. Messages will only work if shop provides its own credentials.');
    return;
  }

  try {
    defaultClient = twilio(accountSid, authToken);
    console.log('[twilio] ✅ Global Twilio client initialized.');
  } catch (err) {
    console.error('[twilio] ❌ Failed to initialize Twilio:', err.message);
  }
}

/**
 * Get a Twilio client for a specific shop, or fallback to global.
 * @param {Object} shopCredentials - { twilio_account_sid, twilio_auth_token }
 * @returns {twilio.Twilio|null}
 */
function getClient(shopCredentials) {
  // If shop has its own credentials, use them.
  if (shopCredentials && shopCredentials.twilio_account_sid && shopCredentials.twilio_auth_token) {
    if (!shopCredentials.twilio_account_sid.startsWith('AC')) {
      console.warn('[twilio] ⚠️ Invalid shop Account SID, falling back to global.');
      return defaultClient;
    }
    try {
      return twilio(shopCredentials.twilio_account_sid, shopCredentials.twilio_auth_token);
    } catch (err) {
      console.warn('[twilio] ⚠️ Failed to create shop client, falling back to global:', err.message);
      return defaultClient;
    }
  }
  return defaultClient;
}

/**
 * Format a phone number for Twilio (adds 'whatsapp:' prefix if needed).
 * Strips any existing 'whatsapp:' prefix first to avoid duplication.
 * @param {string} number - Raw phone number (e.g., +919876543210 or whatsapp:+919876543210)
 * @returns {string|null} Formatted number for Twilio (e.g., whatsapp:+919876543210)
 */
function formatWhatsAppNumber(number) {
  if (!number) return null;
  // Remove any existing 'whatsapp:' prefix
  let cleaned = number.replace(/^whatsapp:/i, '').replace(/\s/g, '');
  // Must start with '+' and digits
  if (!cleaned.match(/^\+?\d{1,15}$/)) {
    console.warn('[twilio] ❌ Invalid phone number format:', cleaned);
    return null;
  }
  // Ensure it starts with '+' for E.164
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return `whatsapp:${cleaned}`;
}

/**
 * Send a WhatsApp message.
 * @param {string} to - Recipient phone number (E.164 with +)
 * @param {string} body - Message text
 * @param {Object} shopCredentials - { twilio_account_sid, twilio_auth_token, twilio_whatsapp_number }
 * @param {string} senderOverride - Optional sender number (overrides shopCredentials)
 * @returns {Promise<Object>} { sent: boolean, sid?: string, error?: string }
 */
async function sendMessage(to, body, shopCredentials, senderOverride) {
  const client = getClient(shopCredentials);
  if (!client) {
    console.error('[twilio] ❌ No Twilio client available. Check credentials.');
    return { sent: false, error: 'Twilio client not initialized' };
  }

  // Determine sender number
  let fromNumber = senderOverride || shopCredentials?.twilio_whatsapp_number;

  // If shop provides its own credentials but no sender number, fail.
  if (shopCredentials && shopCredentials.twilio_account_sid && shopCredentials.twilio_auth_token && !fromNumber) {
    console.error('[twilio] ❌ Shop has its own credentials but no sender number. Please set twilio_whatsapp_number in shop settings.');
    return { sent: false, error: 'Missing sender number for shop credentials' };
  }

  // If no sender number from shop, use global env or sandbox default.
  if (!fromNumber) {
    fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
  }

  const from = formatWhatsAppNumber(fromNumber);
  const toFormatted = formatWhatsAppNumber(to);

  if (!from || !toFormatted) {
    console.error('[twilio] ❌ Invalid from/to numbers:', { from, toFormatted });
    return { sent: false, error: 'Invalid phone numbers' };
  }

  try {
    const msg = await client.messages.create({
      from,
      to: toFormatted,
      body,
    });
    console.log(`[twilio] ✅ Message sent to ${to}: ${msg.sid}`);
    return { sent: true, sid: msg.sid };
  } catch (err) {
    console.error('[twilio] ❌ Send failed:', err.message);
    // Provide more specific guidance for common errors
    if (err.message.includes('Channel')) {
      console.error('[twilio] 💡 The sender number is not recognized as a WhatsApp sender for this account. Check that the number is active and belongs to this account.');
    } else if (err.message.includes('Authentication')) {
      console.error('[twilio] 💡 Invalid Account SID or Auth Token. Check your Twilio credentials.');
    }
    return { sent: false, error: err.message };
  }
}

// ---- Message templates ----
const STATUS_MESSAGES = {
  pending: (job) =>
    `Hi ${job.customer_name}, your ${job.bike_model} (${job.bike_number}) has been received at our shop. Order #${job.order_number}. We'll update you as work progresses.`,
  in_progress: (job) =>
    `Update: Work has started on your ${job.bike_model} (${job.bike_number}). Order #${job.order_number}.`,
  on_hold: (job) =>
    `Update: Your ${job.bike_model} (${job.bike_number}) work is temporarily on hold. We'll notify you once it resumes. Order #${job.order_number}.`,
  completed: (job) =>
    `Good news! Your ${job.bike_model} (${job.bike_number}) is ready. Order #${job.order_number}. You can collect it anytime.`,
  delivered: (job) =>
    `Thank you for choosing us! Your ${job.bike_model} (${job.bike_number}) has been delivered. Order #${job.order_number}.`,
};

/**
 * Notify customer of job status change.
 * @param {Object} job - Job object containing customer_name, bike_model, bike_number, order_number, phone_number, status
 * @param {Object} shopCredentials - { twilio_account_sid, twilio_auth_token, twilio_whatsapp_number }
 * @param {string} senderOverride - Optional sender number
 * @returns {Promise<Object>} Result of sendMessage
 */
async function notifyStatusChange(job, shopCredentials, senderOverride) {
  const builder = STATUS_MESSAGES[job.status];
  if (!builder) {
    console.warn(`[twilio] ⚠️ No message template for status: ${job.status}`);
    return { sent: false, error: 'No template for this status' };
  }
  const body = builder(job);
  return sendMessage(job.phone_number, body, shopCredentials, senderOverride);
}

/**
 * Notify mechanic of new job assignment.
 * @param {Object} job - Job object
 * @param {Object} mechanic - Mechanic object with phone and name
 * @param {Object} shopCredentials - Shop Twilio credentials
 * @param {string} senderOverride - Optional sender
 */
async function notifyMechanicJobAssigned(job, mechanic, shopCredentials, senderOverride) {
  if (!mechanic.phone) {
    console.warn('[twilio] ⚠️ Mechanic has no phone number, cannot send assignment notification.');
    return { sent: false, error: 'Mechanic has no phone number' };
  }
  const body =
    `Hi ${mechanic.name}, you have been assigned a new job!\n\n` +
    `Order: ${job.order_number}\nCustomer: ${job.customer_name}\nBike: ${job.bike_model} (${job.bike_number})\n\n` +
    `Check the dashboard for details.`;
  return sendMessage(mechanic.phone, body, shopCredentials, senderOverride);
}

/**
 * Notify mechanic of job status change (optional).
 */
async function notifyMechanicStatusChange(job, mechanic, shopCredentials, senderOverride) {
  if (!mechanic.phone) return { sent: false, error: 'Mechanic has no phone number' };
  const body =
    `Job Update: ${job.order_number}\n` +
    `Status: ${job.status.replace('_', ' ').toUpperCase()}\n\n` +
    `Customer: ${job.customer_name}\nBike: ${job.bike_model}`;
  return sendMessage(mechanic.phone, body, shopCredentials, senderOverride);
}

module.exports = {
  init,
  sendMessage,
  notifyStatusChange,
  notifyMechanicJobAssigned,
  notifyMechanicStatusChange,
};