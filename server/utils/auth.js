const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const EXPIRY = '12h';

function issueToken(payload, expiresIn = EXPIRY) {
  const safePayload = {
    sub: payload.id || payload.shop_id || payload.mechanic_id,
    role: payload.role,
    shop_id: payload.shop_id,
    shop_name: payload.shop_name,
    owner_name: payload.owner_name,
    mechanic_id: payload.mechanic_id,
    name: payload.name,
    shop_url: payload.shop_url,
    shop_service_key: payload.shop_service_key,
    iat: Math.floor(Date.now() / 1000),
  };
  return jwt.sign(safePayload, SECRET, {
    algorithm: 'HS256',
    expiresIn,
    issuer: 'velo-shop',
    audience: 'velo-shop-api',
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET, {
      algorithms: ['HS256'],
      issuer: 'velo-shop',
      audience: 'velo-shop-api',
    });
  } catch (err) {
    console.error('[auth] JWT verification failed:', err.message);
    return null;
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const token = req.cookies[`token_${role}`];
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== role) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    req.user = decoded;
    next();
  };
}

module.exports = { issueToken, verifyToken, requireRole, SECRET, EXPIRY };