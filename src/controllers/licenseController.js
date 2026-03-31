const licenseService = require('../services/licenseService');

const getRequestMeta = (req) => ({
  ip: req.ip,
  userAgent: req.header('user-agent') || ''
});

const activate = async (req, res) => {
  const result = await licenseService.activateLicense({
    ...req.body,
    requestMeta: getRequestMeta(req)
  });
  res.status(201).json({
    success: true,
    data: result
  });
};

const restore = async (req, res) => {
  const result = await licenseService.restoreActivation({
    ...req.body,
    requestMeta: getRequestMeta(req)
  });
  res.json({
    success: true,
    data: result
  });
};

const heartbeat = async (req, res) => {
  const activationToken = req.body.activationToken || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const result = await licenseService.heartbeat({
    ...req.body,
    activationToken,
    requestMeta: getRequestMeta(req)
  });
  res.json({
    success: true,
    data: result
  });
};

const deactivate = async (req, res) => {
  const activationToken = req.body.activationToken || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const result = await licenseService.deactivate({
    ...req.body,
    activationToken,
    requestMeta: getRequestMeta(req)
  });
  res.json({
    success: true,
    data: result
  });
};

const status = async (req, res) => {
  const activationToken = req.query.activationToken || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const result = await licenseService.getLicenseStatus({
    ...req.query,
    activationToken,
    requestMeta: getRequestMeta(req)
  });
  res.json({
    success: true,
    data: result
  });
};

module.exports = {
  activate,
  restore,
  heartbeat,
  deactivate,
  status
};
