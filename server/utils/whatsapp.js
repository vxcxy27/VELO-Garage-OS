// ===================================================================
// WhatsApp automation
// Uses whatsapp-web.js, which drives a real WhatsApp Web session through
// a headless browser. You log in ONCE by scanning a QR code with your own
// phone's WhatsApp app - after that this process can send messages on your
// behalf with no per-message fees and no third-party API (e.g. Twilio).
//
// IMPORTANT: this requires the `whatsapp-web.js` + `puppeteer` packages to be
// installed with internet access (npm install), and a Chromium build to run
// locally. It will NOT work inside a sandboxed/offline environment - run this
// on your own server/computer.
// ===================================================================

let Client, LocalAuth;
try {
  ({ Client, LocalAuth } = require('whatsapp-web.js'));
} catch (e) {
  console.warn('[whatsapp] whatsapp-web.js not installed yet - run `npm install` first.');
}

const QRCode = require('qrcode');

let client = null;
let latestQR = null;
let status = 'disconnected'; // disconnected | qr_pending | ready | auth_failure

function init() {
  if (!Client) return;
  if (process.env.WHATSAPP_ENABLED !== 'true') {
    console.log('[whatsapp] Disabled via WHATSAPP_ENABLED env flag.');
    return;
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: require('path').join(__dirname, '../whatsapp-session') }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });

  client.on('qr', async (qr) => {
    status = 'qr_pending';
    latestQR = await QRCode.toDataURL(qr);
    console.log('[whatsapp] Scan the QR code from the admin portal > WhatsApp Setup page.');
  });

  client.on('ready', () => {
    status = 'ready';
    latestQR = null;
    console.log('[whatsapp] Connected and ready to send messages.');
  });

  client.on('auth_failure', () => {
    status = 'auth_failure';
  });

  client.on('disconnected', () => {
    status = 'disconnected';
  });

  client.initialize();
}

function getStatus() {
  return { status, qr: latestQR };
}

/**
 * Sends a plain text WhatsApp message to a phone number.
 * `phone` should include country code, digits only (e.g. 919876543210)
 */
async function sendMessage(phone, message) {
  if (!client || status !== 'ready') {
    console.warn(`[whatsapp] Not connected - message NOT sent to ${phone}: "${message}"`);
    return { sent: false, reason: 'WhatsApp not connected' };
  }
  const chatId = `${phone.replace(/\D/g, '')}@c.us`;
  try {
    await client.sendMessage(chatId, message);
    return { sent: true };
  } catch (err) {
    console.error('[whatsapp] send failed', err);
    return { sent: false, reason: err.message };
  }
}

const STATUS_MESSAGES = {
  pending: (job) => `Hi ${job.customer_name}, your ${job.bike_model} (${job.bike_number}) has been received at our shop. Order #${job.order_number}. We'll update you as work progresses.`,
  in_progress: (job) => `Update: Work has started on your ${job.bike_model} (${job.bike_number}). Order #${job.order_number}.`,
  on_hold: (job) => `Update: Your ${job.bike_model} (${job.bike_number}) work is temporarily on hold. We'll notify you once it resumes. Order #${job.order_number}.`,
  completed: (job) => `Good news! Your ${job.bike_model} (${job.bike_number}) is ready. Order #${job.order_number}. You can collect it anytime.`,
  delivered: (job) => `Thank you for choosing us! Your ${job.bike_model} (${job.bike_number}) has been delivered. Order #${job.order_number}.`,
};

async function notifyStatusChange(job) {
  const builder = STATUS_MESSAGES[job.status];
  if (!builder) return { sent: false, reason: 'No template for this status' };
  return sendMessage(job.phone_number, builder(job));
}

module.exports = { init, getStatus, sendMessage, notifyStatusChange };
