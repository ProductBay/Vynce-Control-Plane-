const isExpired = (expiresAt) => Boolean(expiresAt) && new Date(expiresAt).getTime() <= Date.now();

const canProvisionUser = ({ includedUsers, extraSeats }) => includedUsers + extraSeats > 1;

module.exports = { isExpired, canProvisionUser };
