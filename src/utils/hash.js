const crypto = require('crypto');
const licenseAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const normalizeLicenseKey = (value) => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

const hashValue = (value) => crypto.createHash('sha256').update(value).digest('hex');

const hashLicenseKey = (licenseKey) => hashValue(normalizeLicenseKey(licenseKey));

const normalizeDeviceFingerprint = (fingerprint) => fingerprint.trim().toLowerCase();

const hashDeviceFingerprint = (fingerprint) => hashValue(normalizeDeviceFingerprint(fingerprint));

const generateLicenseKey = () => {
  const bytes = crypto.randomBytes(16);
  const chars = Array.from(bytes, (byte) => licenseAlphabet[byte % licenseAlphabet.length]).join('');
  return chars.match(/.{1,4}/g).join('-');
};

module.exports = {
  generateLicenseKey,
  normalizeLicenseKey,
  hashLicenseKey,
  normalizeDeviceFingerprint,
  hashDeviceFingerprint
};
