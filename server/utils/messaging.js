// server/utils/messaging.js
const whatsapp = require('./msg91-whatsapp');

const DEFAULT_TEMPLATE = process.env.MSG91_WHATSAPP_TEMPLATE || 'update';
const DEFAULT_NAMESPACE = process.env.MSG91_WHATSAPP_NAMESPACE;

function buildStatusVariables(job) {
  // Update this to match your template placeholders
  // If using {{customer_name}}, use customer_name as key
  return {
    customer_name: job.customer_name,
    bike_model: job.bike_model,
    bike_number: job.bike_number,
    status: job.status.replace('_', ' ').toUpperCase(),
    order_number: job.order_number
  };
}

async function notifyStatusChange(job, shopCredentials) {
  // IMPORTANT: Ensure the job has a phone_number
  if (!job.phone_number) {
    console.error('[messaging] Job has no phone number, skipping WhatsApp.');
    return { sent: false, error: 'No phone number on job' };
  }

  // Remove leading '+' if present
  const to = job.phone_number.replace(/^\+/, '').trim();
  if (!to) {
    console.error('[messaging] Invalid phone number after cleaning:', job.phone_number);
    return { sent: false, error: 'Invalid phone number' };
  }

  const variables = buildStatusVariables(job);
  const templateName = shopCredentials?.msg91_whatsapp_template || DEFAULT_TEMPLATE;
  const namespace = shopCredentials?.msg91_whatsapp_namespace || DEFAULT_NAMESPACE;

  console.log(`[messaging] Sending WhatsApp to ${to} with template ${templateName}`);
  return await whatsapp.sendWhatsAppTemplate(to, templateName, namespace, variables, shopCredentials);
}

async function notifyMechanicJobAssigned(job, mechanic, shopCredentials) {
  // ... (similar, but with mechanic's phone)
  if (!mechanic.phone) {
    return { sent: false, error: 'Mechanic has no phone number' };
  }
  const to = mechanic.phone.replace(/^\+/, '').trim();
  // For mechanic, you'll need a separate template; skip for now
  console.warn('[messaging] Mechanic notifications not implemented yet.');
  return { sent: false, error: 'Mechanic WhatsApp not implemented' };
}

module.exports = {
  notifyStatusChange,
  notifyMechanicJobAssigned,
};