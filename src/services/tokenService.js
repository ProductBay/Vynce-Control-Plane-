const { SignJWT, importPKCS8, importSPKI, jwtVerify } = require('jose');
const { env } = require('../config/env');
const { AppError } = require('../utils/appError');

const algorithm = 'RS256';
let privateKeyPromise;
let publicKeyPromise;

const getPrivateKey = () => {
  if (!privateKeyPromise) {
    privateKeyPromise = importPKCS8(env.JWT_SIGNING_PRIVATE_KEY, algorithm);
  }
  return privateKeyPromise;
};

const getPublicKey = () => {
  if (!publicKeyPromise) {
    publicKeyPromise = importSPKI(env.JWT_SIGNING_PUBLIC_KEY, algorithm);
  }
  return publicKeyPromise;
};

const signPayload = async (payload, expiresIn) => {
  const privateKey = await getPrivateKey();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: algorithm, typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(env.CONTROL_PLANE_BASE_URL)
    .setAudience('vynce-clients')
    .setExpirationTime(expiresIn)
    .sign(privateKey);
};

const signActivationToken = async (payload) => signPayload({ type: 'activation', ...payload }, env.ACTIVATION_TOKEN_TTL);

const signStatusToken = async (payload) => signPayload({ type: 'status', ...payload }, env.STATUS_TOKEN_TTL);

const verifyToken = async (token) => {
  try {
    const publicKey = await getPublicKey();
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: env.CONTROL_PLANE_BASE_URL,
      audience: 'vynce-clients'
    });
    return payload;
  } catch (error) {
    throw new AppError(401, 'Invalid or expired activation token');
  }
};

const verifyActivationToken = async (token) => {
  const payload = await verifyToken(token);
  if (payload.type !== 'activation') {
    throw new AppError(401, 'Activation token is required');
  }
  return payload;
};

module.exports = {
  signActivationToken,
  signStatusToken,
  verifyToken,
  verifyActivationToken
};
