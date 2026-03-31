const adminService = require('../services/adminService');

const getTenantLicense = async (req, res) => {
  const result = await adminService.getTenantLicense(req.query.tenantId);
  res.json({
    success: true,
    data: result
  });
};

const issueLicense = async (req, res) => {
  const result = await adminService.issueLicense(req.body);
  res.status(201).json({
    success: true,
    data: result
  });
};

const revokeLicense = async (req, res) => {
  const result = await adminService.revokeLicense(req.body);
  res.json({
    success: true,
    data: result
  });
};

const resetLicense = async (req, res) => {
  const result = await adminService.resetLicenseActivations(req.body);
  res.json({
    success: true,
    data: result
  });
};

const revokeActivation = async (req, res) => {
  const result = await adminService.revokeActivation(req.body);
  res.json({
    success: true,
    data: result
  });
};

const resetActivation = async (req, res) => {
  const result = await adminService.resetActivation(req.body);
  res.json({
    success: true,
    data: result
  });
};

const grantSeats = async (req, res) => {
  const result = await adminService.grantSeats(req.body);
  res.json({
    success: true,
    data: result
  });
};

module.exports = {
  getTenantLicense,
  issueLicense,
  revokeLicense,
  resetLicense,
  revokeActivation,
  resetActivation,
  grantSeats
};
