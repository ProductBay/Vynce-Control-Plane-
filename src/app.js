const express = require('express');
const { healthRoutes } = require('./routes/healthRoutes');
const { licenseRoutes } = require('./routes/licenseRoutes');
const { adminRoutes } = require('./routes/adminRoutes');
const { securityHeaders } = require('./middleware/securityHeaders');
const { corsPolicy } = require('./middleware/corsPolicy');
const { apiRateLimit } = require('./middleware/rateLimit');
const { notFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(corsPolicy);
app.use(apiRateLimit);
app.use(express.json({ limit: '1mb' }));

app.use('/api', healthRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = { app };
