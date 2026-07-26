// server/utils/messaging.js
const twilio = require('./twilio-sms');

const FOOTER = '\n\nPowered by VELO - Garage OS';

/**
 * Format a phone number to E.164 format (with + and country code).
 * Assumes Indian numbers (+91) for 10-digit numbers without a country code.
 * @param {string} phone - Raw phone number
 * @returns {string|null} Formatted number or null if invalid
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;
  // Remove all non-digit characters (spaces, dashes, brackets, etc.)
  let cleaned = phone.replace(/\D/g, '');
  // Remove leading '0' if present (common in Indian numbers)
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  // If it's a 10-digit number, assume it's Indian and add +91
  if (cleaned.length === 10) {
    cleaned = '+91' + cleaned;
  } else if (cleaned.length > 10 && !cleaned.startsWith('+')) {
    // If it's longer but no +, assume it already has country code, just add +
    cleaned = '+' + cleaned;
  } else if (cleaned.length < 10) {
    console.warn('[messaging] Invalid phone number length:', phone);
    return null;
  }
  return cleaned;
}

function buildStatusMessage(job) {
  const templates = {
    pending: (j) =>
      `Hi ${j.customer_name}, your ${j.bike_model} (${j.bike_number}) has been received. Order #${j.order_number}. We'll update you soon.`,
    in_progress: (j) =>
      `Update: Work started on your ${j.bike_model} (${j.bike_number}). Order #${j.order_number}.`,
    on_hold: (j) =>
      `Update: Your ${j.bike_model} (${j.bike_number}) work is on hold. Order #${j.order_number}.`,
    completed: (j) =>
      `Good news! Your ${j.bike_model} (${j.bike_number}) is ready. Order #${j.order_number}.`,
    delivered: (j) =>
      `Thank you! Your ${j.bike_model} (${j.bike_number}) has been delivered. Order #${j.order_number}.`,
  };
  const fn = templates[job.status];
  if (!fn) return null;
  return fn(job) + FOOTER;
}

/**
 * Send a notification for a job status change.
 * @param {Object} job - Job object
 * @param {Object} shopCredentials - (unused, kept for compatibility)
 * @param {string} channel - ignored (always SMS)
 */
async function notifyStatusChange(job, shopCredentials = null, channel = 'sms') {
  const body = buildStatusMessage(job);
  if (!body) {
    return { sent: false, error: 'No message template for this status' };
  }
  const rawNumber = job.phone_number;
  const formattedNumber = formatPhoneNumber(rawNumber);
  if (!formattedNumber) {
    console.error('[messaging] Invalid phone number:', rawNumber);
    return { sent: false, error: 'Invalid phone number format' };
  }
  return await twilio.sendSMS(formattedNumber, body, shopCredentials);
}

/**
 * Notify mechanic of new job assignment.
 */
async function notifyMechanicJobAssigned(job, mechanic, shopCredentials = null) {
  if (!mechanic.phone) {
    return { sent: false, error: 'Mechanic has no phone number' };
  }
  const rawNumber = mechanic.phone;
  const formattedNumber = formatPhoneNumber(rawNumber);
  if (!formattedNumber) {
    console.error('[messaging] Invalid mechanic phone number:', rawNumber);
    return { sent: false, error: 'Invalid mechanic phone number format' };
  }
  const body =
    `Hi ${mechanic.name}, you have been assigned a new job!\n` +
    `Order: ${job.order_number}\nCustomer: ${job.customer_name}\nBike: ${job.bike_model} (${job.bike_number})\n` +
    `Check the dashboard for details.` +
    FOOTER;
  return await twilio.sendSMS(formattedNumber, body, shopCredentials);
}

module.exports = {
  notifyStatusChange,
  notifyMechanicJobAssigned,
};