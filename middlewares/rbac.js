const { fail } = require('../utils/apiResponse');

/**
 * Restricts a route to specific roles. Not applied to the dashboard route
 * in Phase 2 (Admin and Operator both see the same dashboard) but wired up
 * now so feature modules in later phases can just do:
 *   router.post('/vouchers', requireAuth, requireRole('admin'), ...)
 */
function requireRole(...allowedRoles) {
  return function rbac(req, res, next) {
    if (!req.user) {
      return fail(res, 401, 'Belum login.');
    }
    if (!allowedRoles.includes(req.user.role)) {
      return fail(res, 403, 'Anda tidak memiliki akses untuk aksi ini.');
    }
    next();
  };
}

module.exports = { requireRole };
