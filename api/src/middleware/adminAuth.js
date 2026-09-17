// Requires auth middleware to run first (req.user must be set)
// Only allows users with role = 'superadmin'
module.exports = (req, res, next) => {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
};
