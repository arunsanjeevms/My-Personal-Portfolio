'use strict';

/**
 * Request validation for the auth routes.
 *
 * Validation runs before any controller logic so malformed input never
 * reaches the service layer or the database.
 */

const { body, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors');

const loginRules = [
  body('identifier')
    .trim()
    .notEmpty().withMessage('Enter your email address or username.')
    .isLength({ max: 190 }).withMessage('That value is too long.')
    // Not isEmail(): the field also accepts a username.
    .escape(),
  body('password')
    .notEmpty().withMessage('Enter your password.')
    .isLength({ max: 200 }).withMessage('That password is too long.'),
  body('remember').optional().toBoolean(),
];

const changePasswordRules = [
  body('current_password').notEmpty().withMessage('Enter your current password.'),
  body('new_password')
    .isLength({ min: 12, max: 128 }).withMessage('Use between 12 and 128 characters.'),
  body('confirm_password').custom((value, { req }) => {
    if (value !== req.body.new_password) throw new Error('The two passwords do not match.');
    return true;
  }),
];

const forgotPasswordRules = [
  body('email')
    .trim()
    .isEmail().withMessage('Enter a valid email address.')
    .normalizeEmail()
    .isLength({ max: 190 }),
];

const resetPasswordRules = [
  body('token').trim().notEmpty().withMessage('The reset link is incomplete.'),
  body('new_password')
    .isLength({ min: 12, max: 128 }).withMessage('Use between 12 and 128 characters.'),
  body('confirm_password').custom((value, { req }) => {
    if (value !== req.body.new_password) throw new Error('The two passwords do not match.');
    return true;
  }),
];

/**
 * Turns express-validator output into a ValidationError whose `details`
 * is keyed by field name, which is what the templates expect.
 */
function handleValidation(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = {};
  for (const error of result.array()) {
    if (!details[error.path]) details[error.path] = error.msg;
  }

  return next(new ValidationError('Please correct the highlighted fields.', details));
}

module.exports = {
  loginRules,
  changePasswordRules,
  forgotPasswordRules,
  resetPasswordRules,
  handleValidation,
};
