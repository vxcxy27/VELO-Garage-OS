// server/utils/twilio-sms.js
const twilio = require('twilio');

const GLOBAL_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const GLOBAL_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const GLOBAL_SMS_NUMBER = process.env.TWILIO_SMS_NUMBER;
;

/**
 * Send an SMS via Twilio using shop credentials or global fallback.
 * @param {string} to - Recipient phone number (E.164 format)
 * @param {string} message - Plain text message
 * @param {Object} shopCredentials - { twilio_account_sid, twilio_auth_token, twilio_sms_number }
 * @returns {Promise<{sent: boolean, sid?: string, error?: string}>}
 */
async function sendSMS(to, message, shopCredentials = null) {
  const accountSid = shopCredentials?.twilio_account_sid || GLOBAL_ACCOUNT_SID;
  const authToken = shopCredentials?.twilio_auth_token || GLOBAL_AUTH_TOKEN;
  const fromNumber = shopCredentials?.twilio_sms_number || GLOBAL_SMS_NUMBER;
  //const accountSid = 'ACc8553f789cfe603325ed64c1ffb21f47'; // your test SID
//const authToken = 'c2388c0ecc3ae9f78e6ca541078a4bc2';
//const fromNumber = '+19517092718'

  if (!accountSid || !authToken || !fromNumber) {
    const errorMsg = 'Twilio credentials missing. Please configure in shop settings or .env.';
    console.error('[Twilio SMS]', errorMsg);
    return { sent: false, error: errorMsg };
  }

  const client = twilio(accountSid, authToken);

  try {
    const msg = await client.messages.create({
      body: message,
      from: fromNumber,
      to: to,
    });
    console.log(`[Twilio SMS] Sent to ${to}: ${msg.sid}`);
    return { sent: true, sid: msg.sid };
  } catch (err) {
    console.error('[Twilio SMS] Error:', err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendSMS };