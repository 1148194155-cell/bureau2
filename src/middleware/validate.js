/**
 * Zod request validation middleware.
 *
 * Provides a `validate` function that returns Express middleware.
 * Validates req.body (and optionally req.params / req.query) against a Zod schema.
 *
 * Usage:
 *   import { z } from 'zod';
 *   import { validate } from '../middleware/validate.js';
 *
 *   const schema = z.object({ name: z.string().min(1), count: z.number().optional() });
 *   router.post('/items', validate({ body: schema }), handler);
 */

/**
 * Create an Express validation middleware from Zod schemas.
 *
 * @param {object} schemas - { body?, params?, query? } each an optional Zod schema
 * @returns Express middleware
 */
export function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      next();
    } catch (err) {
      const issues = err.issues?.map(i => ({
        path: i.path.join('.'),
        message: i.message,
      })) || [{ message: err.message }];

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: issues,
      });
    }
  };
}

export default { validate };
