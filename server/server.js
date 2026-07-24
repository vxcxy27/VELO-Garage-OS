require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { securityHeaders, limiter, authLimiter, sanitizeBody } = require('./middleware/security');

const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const mechanicRoutes = require('./routes/mechanicRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
securityHeaders(app);

// Rate limiting
app.use(limiter);
app.use('/api/auth', authLimiter);

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// XSS sanitization
app.use(sanitizeBody);

app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/mechanic', mechanicRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚲 Velo Shop running: http://localhost:${PORT}`);
  console.log('Portals:');
  console.log(`  🏪 Shop owner   -> http://localhost:${PORT}/login/shop.html`);
  console.log(`  🔧 Mechanic     -> http://localhost:${PORT}/login/mechanic.html`);
  console.log(`  ⚙️ Admin (you)  -> http://localhost:${PORT}/login/admin.html`);
  console.log('\n📱 Messaging: MSG91 WhatsApp (primary) + SMS (fallback)');
});