import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { userRouter } from '../modules/user/user.routes.js';
import { sendSuccess } from '../shared/apiResponse.js';
import { env } from '../config/env.js';

/**
 * Aggregates every feature route into a single router that is mounted at
 * `env.API_PREFIX` (default `/api/v1`).
 *
 * Add new feature routes below, e.g.:
 *   import { wishlistRouter } from '../modules/wishlist/wishlist.routes.js';
 *   apiRouter.use('/wishlist', wishlistRouter);
 */
export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  sendSuccess(res, {
    name: 'Wishbox API',
    version: 'v1',
    prefix: env.API_PREFIX,
  }, { message: 'Wishbox API is running' });
});

apiRouter.use('/health', healthRouter);

// --- Account ---------------------------------------------------------------
// Passwordless login (OTP) and the signed-in shopper's profile.
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
