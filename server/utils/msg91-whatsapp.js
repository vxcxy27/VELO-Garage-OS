// server/utils/msg91-whatsapp.js
const axios = require('axios');

const GLOBAL_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const GLOBAL_WHATSAPP_NUMBER = process.env.MSG91_WHATSAPP_NUMBER;
const GLOBAL_TEMPLATE = process.env.MSG91_WHATSAPP_TEMPLATE;
const GLOBAL_NAMESPACE = process.env.MSG91_WHATSAPP_NAMESPACE;

async function sendWhatsAppTemplate(to, templateName, namespace, variables, shopCredentials) {
  if (!to || to.trim() === '') {
    console.error('[MSG91 WhatsApp] ❌ Recipient phone number is missing.');
    return { sent: false, error: 'Recipient phone number is required' };
  }

  const authKey = shopCredentials?.msg91_auth_key || GLOBAL_AUTH_KEY;
  const integratedNumber = shopCredentials?.msg91_whatsapp_number || GLOBAL_WHATSAPP_NUMBER;
  const finalTemplate = templateName || GLOBAL_TEMPLATE;
  const finalNamespace = namespace || GLOBAL_NAMESPACE;

  if (!authKey || !integratedNumber || !finalTemplate || !finalNamespace) {
    console.error('[MSG91 WhatsApp] Missing configuration.');
    return { sent: false, error: 'WhatsApp not configured' };
  }

  // Variables must be in the correct order as per the template placeholders.
  // If your template uses {{1}}, {{2}}, ..., the order is:
  // 1: customer_name, 2: bike_model, 3: bike_number, 4: status, 5: order_number
  // If you use named placeholders, you may need to use a different approach.
  // We'll assume numbered placeholders for simplicity.
  const paramOrder = ['customer_name', 'bike_model', 'bike_number', 'status', 'order_number'];
  const parameters = paramOrder.map(key => ({
    type: 'text',
    text: String(variables[key] || '')
  }));

  const payload = {
    integrated_number: integratedNumber,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: finalTemplate,
        language: { code: 'en_US' },
        namespace: finalNamespace,
        components: [
          {
            type: 'body',
            parameters: parameters
          }
        ]
      }
    }
  };

  console.log('[MSG91 WhatsApp] Sending to:', to);
  console.log('[MSG91 WhatsApp] Full payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/',
      payload,
      {
        headers: {
          authkey: authKey,
          'Content-Type': 'application/json',
        },
      }
    );
    if (response.status === 200) {
      console.log(`[MSG91 WhatsApp] ✅ Message accepted for ${to}`);
      return { sent: true, requestId: response.data?.request_id };
    } else {
      console.error('[MSG91 WhatsApp] Failed:', response.data);
      return { sent: false, error: response.data };
    }
  } catch (err) {
    if (err.response) {
      console.error('[MSG91 WhatsApp] Error status:', err.response.status);
      console.error('[MSG91 WhatsApp] Error data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('[MSG91 WhatsApp] Error:', err.message);
    }
    return { sent: false, error: err.message };
  }
}

module.exports = { sendWhatsAppTemplate };