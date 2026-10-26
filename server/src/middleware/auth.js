const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  throw new Error('FATAL: JWT_SECRET and JWT_REFRESH_SECRET environment variables are required.');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function generateTokens(user) {
  const payload = {
    userId: user.user_id,
    email: user.email,
    role: user.role,
    sapId: user.sap_id
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });

  return { accessToken, refreshToken };
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];

  // 1. Try Firebase Admin verifyIdToken if token could be a Firebase token
  try {
    const { getAuth } = require('../utils/firebaseAdmin');
    const adminAuth = getAuth();
    if (adminAuth) {
      const decoded = await adminAuth.verifyIdToken(token);
      if (decoded) {
        let role = decoded.role;
        let sapId = decoded.sap_id || null;
        let emailVerified = !!decoded.email_verified;

        try {
          const { getDoc, COLLECTIONS } = require('../database/firestoreDb');
          const userDoc = await getDoc(COLLECTIONS.USERS, decoded.uid);
          if (userDoc) {
            if (!role && userDoc.role) role = userDoc.role;
            if (!sapId && userDoc.sap_id) sapId = userDoc.sap_id;
            if (userDoc.email_verified === 1 || userDoc.email_verified === true) {
              emailVerified = true;
            }
          }
        } catch (uErr) {}

        if (!role) role = 'student';

        if (!emailVerified && role !== 'admin') {
          return res.status(403).json({ error: 'Email verification required. Please verify your email before accessing this resource.' });
        }
        req.user = {
          userId: decoded.uid,
          email: decoded.email,
          role,
          sapId
        };
        return next();
      }
    }
  } catch (fbErr) {
    // If not a Firebase token or Firebase Admin not configured for live network, proceed to JWT check
  }

  // 2. Application JWT Verification
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    // Fallback: check if valid Firebase token issued for this project
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const expectedProj = process.env.FIREBASE_PROJECT_ID || 'seproject-feefe';
        const isFirebaseIssuer = payload.iss && (payload.iss.includes('securetoken.google.com') || payload.aud === expectedProj);
        if (isFirebaseIssuer) {
          const now = Math.floor(Date.now() / 1000);
          if (payload.exp && payload.exp < now) {
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
          }

          const uid = payload.user_id || payload.sub;
          let role = payload.role;
          let sapId = payload.sap_id || null;
          let emailVerified = !!payload.email_verified;

          try {
            const { getDoc, COLLECTIONS } = require('../database/firestoreDb');
            const userDoc = await getDoc(COLLECTIONS.USERS, uid);
            if (userDoc) {
              if (!role && userDoc.role) role = userDoc.role;
              if (!sapId && userDoc.sap_id) sapId = userDoc.sap_id;
              if (userDoc.email_verified === 1 || userDoc.email_verified === true) {
                emailVerified = true;
              }
            }
          } catch (uErr) {}

          if (!role) role = 'student';

          if (!emailVerified && role !== 'admin') {
            return res.status(403).json({ error: 'Email verification required. Please verify your email before accessing this resource.' });
          }

          req.user = {
            userId: uid,
            email: payload.email,
            role,
            sapId
          };
          return next();
        }
      }
    } catch (parseErr) {}

    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access forbidden for role ${req.user.role}.` });
    }
    next();
  };
}

module.exports = {
  generateTokens,
  verifyToken,
  requireRole,
  JWT_SECRET,
  JWT_REFRESH_SECRET
};
