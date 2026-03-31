const auditModel = require('../models/auditModel');

const writeAuditLog = async (db, payload) => auditModel.create(db, payload);

module.exports = { writeAuditLog };
