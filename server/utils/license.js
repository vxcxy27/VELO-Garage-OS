const crypto = require('crypto');

const SECRET = process.env.LICENSE_SECRET || crypto.randomBytes(32).toString('hex');

function generateLicense(shopId, months) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt);
  expiresAt.setMonth(expiresAt.getMonth() + Number(months));

  const shopIdHex = shopId.toString(16).toUpperCase().padStart(4, '0').slice(0, 4);
  const expiryTs = Math.floor(expiresAt.getTime() / 1000).toString(16).toUpperCase().padStart(8, '0');

  const payload = `${shopIdHex}.${expiryTs}`;
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  const signature = hmac.digest('hex').toUpperCase().slice(0, 16);

  const raw = `${shopIdHex}${expiryTs}${signature}`;
  const licenseKey = raw.match(/.{1,4}/g).join('-');

  return { licenseKey, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString() };
}

function verifyLicenseSignature(licenseKey) {
  const raw = licenseKey.replace(/-/g, '');
  if (raw.length < 28) return { valid: false, reason: 'Invalid key length' };

  const shopIdHex = raw.slice(0, 4);
  const expiryTs = raw.slice(4, 12);
  const signature = raw.slice(12, 28);

  const payload = `${shopIdHex}.${expiryTs}`;
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  const expected = hmac.digest('hex').toUpperCase().slice(0, 16);

  if (signature !== expected) return { valid: false, reason: 'Invalid signature' };

  const shopId = parseInt(shopIdHex, 16);
  const expiresAtMs = parseInt(expiryTs, 16) * 1000;

  if (isNaN(shopId) || isNaN(expiresAtMs)) return { valid: false, reason: 'Malformed key data' };

  return { valid: true, shopId, expiresAt: new Date(expiresAtMs) };
}

function daysUntil(dateStr) {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

module.exports = { generateLicense, verifyLicenseSignature, daysUntil, SECRET };