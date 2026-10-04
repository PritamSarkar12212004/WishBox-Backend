import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export interface ValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Validates and replaces request input with the parsed result.
 * A ZodError is thrown straight into the global error handler, which turns it
 * into an `422 VALIDATION_ERROR` response listing every offending field.
 *
 * @example
 * router.post('/otp/request', validate({ body: requestOtpSchema }), requestOtp);
 */
export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as typeof req.body;
      }
      // Express 5 makes `req.query` a getter, so the parsed value is stored
      // separately rather than written back over it.
      if (schemas.query) {
        req.validatedQuery = schemas.query.parse(req.query);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
