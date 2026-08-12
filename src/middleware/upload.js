'use strict';

/**
 * Multer configuration.
 *
 * Memory storage on purpose: nothing is written to disk until the buffer
 * has been magic-byte checked and re-encoded by mediaService. A
 * disk-storage engine would put attacker-controlled bytes on the
 * filesystem before any validation ran.
 */

const multer = require('multer');
const { config } = require('../config/env');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

/**
 * A cheap first-pass filter. The authoritative check is the magic-byte
 * sniff in mediaService - this only avoids buffering obviously wrong
 * files, and its verdict is never trusted on its own.
 */
function fileFilter(req, file, callback) {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
    'application/pdf',
  ];

  if (!allowed.includes(file.mimetype)) {
    logger.security('upload: rejected by mime pre-filter', {
      declaredMime: file.mimetype,
      originalName: file.originalname,
      userId: req.session?.user?.id,
    });
    return callback(new ValidationError(
      `"${file.originalname}" is not a supported file type. Upload a JPG, PNG, GIF, WebP, SVG, ICO or PDF.`,
    ));
  }

  return callback(null, true);
}

const uploader = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: config.storage.maxUploadBytes,
    files: 10,
    fields: 20,
    // Long filenames are a classic overflow probe; nothing legitimate needs 500 chars.
    fieldNameSize: 100,
  },
});

/** Turns multer's own errors into friendly, typed errors. */
function handleUploadErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: `That file is too large. The limit is ${Math.round(config.storage.maxUploadBytes / 1024 / 1024)} MB.`,
      LIMIT_FILE_COUNT: 'Too many files at once. Upload up to 10 at a time.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
    };
    return next(new ValidationError(messages[err.code] || 'That upload could not be processed.'));
  }
  return next(err);
}

module.exports = {
  single: (field = 'file') => uploader.single(field),
  array: (field = 'files', max = 10) => uploader.array(field, max),
  handleUploadErrors,
};
