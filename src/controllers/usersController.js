'use strict';

/**
 * User and role management. Super Admin only.
 *
 * Guard rails, because this is the screen where a mistake locks you out
 * of your own site:
 *   - you cannot delete or suspend your own account
 *   - you cannot remove the last active Super Admin
 *   - you cannot promote anyone to a role above your own
 */

const crypto = require('node:crypto');

const db = require('../config/database');
const userRepository = require('../repositories/userRepository');
const authService = require('../services/authService');
const twoFactorService = require('../services/twoFactorService');
const activityService = require('../services/activityService');
const { asyncHandler, NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');

/** GET /admin/users */
const index = asyncHandler(async (req, res) => {
  const [users, roles] = await Promise.all([
    userRepository.listWithRoles(),
    db.query(`
      SELECT r.*, COUNT(DISTINCT u.id) AS user_count, COUNT(DISTINCT rp.permission_id) AS permission_count
        FROM roles r
        LEFT JOIN users u ON u.role_id = r.id AND u.deleted_at IS NULL
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
       GROUP BY r.id
       ORDER BY r.level DESC`),
  ]);

  // 2FA status per user, for the list.
  const withStatus = await Promise.all(users.map(async (user) => ({
    ...user,
    twoFactor: await twoFactorService.getStatus(user.id),
  })));

  res.render('admin/users', {
    title: 'Users & roles',
    activeNav: 'users',
    breadcrumbs: [
      { label: 'Dashboard', url: `${res.locals.adminPath}/dashboard` },
      { label: 'Users & roles' },
    ],
    users: withStatus,
    roles,
    formErrors: {},
    formValues: {},
  });
});

/** POST /admin/users */
const store = asyncHandler(async (req, res) => {
  const actor = req.session.user;
  const name = String(req.body.name || '').trim().slice(0, 120);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 190);
  const username = String(req.body.username || '').trim().slice(0, 60) || null;
  const roleId = Number.parseInt(req.body.role_id, 10);
  const password = String(req.body.password || '');

  const errors = {};
  if (name.length < 2) errors.name = 'Enter a name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter a valid email address.';
  else if (await userRepository.emailTaken(email)) errors.email = 'That email is already registered.';

  if (username && !/^[a-zA-Z0-9._-]{3,60}$/.test(username)) {
    errors.username = 'Letters, numbers, dot, dash and underscore only.';
  } else if (username && await userRepository.usernameTaken(username)) {
    errors.username = 'That username is taken.';
  }

  const role = await db.queryOne('SELECT * FROM roles WHERE id = ?', [roleId]);
  if (!role) errors.role_id = 'Choose a role.';
  // Nobody may create an account more powerful than their own.
  else if (role.level > actor.roleLevel) errors.role_id = 'You cannot grant a role above your own.';

  const passwordProblems = authService.validatePasswordStrength(password, { email, name });
  if (passwordProblems.length) errors.password = passwordProblems[0];

  if (Object.keys(errors).length) {
    const [users, roles] = await Promise.all([userRepository.listWithRoles(), db.query('SELECT * FROM roles ORDER BY level DESC')]);
    return res.status(400).render('admin/users', {
      title: 'Users & roles',
      activeNav: 'users',
      breadcrumbs: [{ label: 'Users & roles' }],
      users: users.map((user) => ({ ...user, twoFactor: { enabled: false } })),
      roles,
      formErrors: errors,
      formValues: { name, email, username, role_id: roleId },
    });
  }

  const id = await userRepository.create({
    uuid: crypto.randomUUID(),
    role_id: roleId,
    name,
    email,
    username,
    status: 'active',
    // The creator knows this password, so it must be replaced on first use.
    must_change_password: 1,
  });
  await userRepository.setPassword(id, await authService.hashPassword(password), { mustChange: true });

  await activityService.record({
    req,
    action: 'user.create',
    entity: 'user',
    entityId: id,
    description: `Created ${role.name} account for ${email}`,
    severity: 'warning',
  });

  req.flash('success', `${name} can now sign in. They will be asked to set their own password.`);
  return res.redirect(`${res.locals.adminPath}/users`);
});

/** POST /admin/users/:id/role */
const updateRole = asyncHandler(async (req, res) => {
  const actor = req.session.user;
  const user = await userRepository.findWithRole(req.params.id);
  if (!user) throw new NotFoundError('That account no longer exists.');

  const role = await db.queryOne('SELECT * FROM roles WHERE id = ?', [req.body.role_id]);
  if (!role) throw new ValidationError('Choose a valid role.');
  if (role.level > actor.roleLevel) throw new ForbiddenError('You cannot grant a role above your own.');
  if (user.role_level > actor.roleLevel) throw new ForbiddenError('You cannot change an account that outranks you.');

  // Never leave the site without a Super Admin.
  if (user.role_slug === 'super_admin' && role.slug !== 'super_admin'
    && await userRepository.isLastOfRole(user.id, 'super_admin')) {
    throw new ValidationError('This is the last Super Admin. Promote someone else first.');
  }

  await userRepository.update(user.id, { role_id: role.id });

  await activityService.record({
    req,
    action: 'user.role_change',
    entity: 'user',
    entityId: user.id,
    description: `Changed ${user.email} from ${user.role_name} to ${role.name}`,
    before: { role: user.role_name },
    after: { role: role.name },
    severity: 'critical',
  });

  req.flash('success', `${user.name} is now ${role.name}.`);
  res.redirect(`${res.locals.adminPath}/users`);
});

/** POST /admin/users/:id/status */
const toggleStatus = asyncHandler(async (req, res) => {
  const actor = req.session.user;
  const user = await userRepository.findWithRole(req.params.id);
  if (!user) throw new NotFoundError('That account no longer exists.');

  if (user.id === actor.id) throw new ValidationError('You cannot suspend your own account.');
  if (user.role_level > actor.roleLevel) throw new ForbiddenError('That account outranks you.');

  const next = user.status === 'active' ? 'suspended' : 'active';

  if (next === 'suspended' && user.role_slug === 'super_admin'
    && await userRepository.isLastOfRole(user.id, 'super_admin')) {
    throw new ValidationError('This is the last active Super Admin and cannot be suspended.');
  }

  await userRepository.update(user.id, { status: next });

  await activityService.record({
    req,
    action: 'user.status',
    entity: 'user',
    entityId: user.id,
    description: `${next === 'suspended' ? 'Suspended' : 'Reactivated'} ${user.email}`,
    severity: 'critical',
  });

  req.flash('success', `${user.name} has been ${next === 'suspended' ? 'suspended' : 'reactivated'}.`);
  res.redirect(`${res.locals.adminPath}/users`);
});

/** POST /admin/users/:id/reset-password */
const resetPassword = asyncHandler(async (req, res) => {
  const actor = req.session.user;
  const user = await userRepository.findWithRole(req.params.id);
  if (!user) throw new NotFoundError('That account no longer exists.');
  if (user.role_level > actor.roleLevel) throw new ForbiddenError('That account outranks you.');

  const password = String(req.body.password || '');
  const problems = authService.validatePasswordStrength(password, { email: user.email, name: user.name });
  if (problems.length) throw new ValidationError(problems[0]);

  await userRepository.setPassword(user.id, await authService.hashPassword(password), { mustChange: true });

  await activityService.record({
    req,
    action: 'user.password_reset',
    entity: 'user',
    entityId: user.id,
    description: `Reset the password for ${user.email}`,
    severity: 'critical',
  });

  req.flash('success', `Password reset. ${user.name} must choose a new one at next sign-in.`);
  res.redirect(`${res.locals.adminPath}/users`);
});

/** POST /admin/users/:id/delete */
const destroy = asyncHandler(async (req, res) => {
  const actor = req.session.user;
  const user = await userRepository.findWithRole(req.params.id);
  if (!user) throw new NotFoundError('That account no longer exists.');

  if (user.id === actor.id) throw new ValidationError('You cannot delete your own account.');
  if (user.role_level > actor.roleLevel) throw new ForbiddenError('That account outranks you.');
  if (user.role_slug === 'super_admin' && await userRepository.isLastOfRole(user.id, 'super_admin')) {
    throw new ValidationError('This is the last Super Admin and cannot be deleted.');
  }

  await userRepository.remove(user.id);          // soft delete
  await twoFactorService.disable(user.id).catch(() => {});

  await activityService.record({
    req,
    action: 'user.delete',
    entity: 'user',
    entityId: user.id,
    description: `Deleted the account for ${user.email}`,
    severity: 'critical',
  });

  req.flash('success', `${user.name}'s account has been removed.`);
  res.redirect(`${res.locals.adminPath}/users`);
});

module.exports = { index, store, updateRole, toggleStatus, resetPassword, destroy };
