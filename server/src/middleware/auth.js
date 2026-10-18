const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nmims_peer_buddy_jwt_super_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'nmims_peer_buddy_refresh_secret_key_2026';
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

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
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
