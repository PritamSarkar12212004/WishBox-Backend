import type { UserDocument } from '../modules/user/user.model.js';

declare global {
  namespace Express {
    interface Request {
      /** Populated by `requireAuth` / `optionalAuth`. */
      user?: UserDocument;
      /**
       * Express 5 exposes `req.query` as a getter, so `validate()` parks the
       * parsed query here instead of writing it back.
       */
      validatedQuery?: unknown;
    }
  }
}

export {};
