import { Router } from 'express';
import { requireAuth, validate } from '../../middleware/index.js';
import { getMe, updateMe } from './user.controller.js';
import { updateProfileSchema } from './user.validation.js';


export const userRouter = Router();

userRouter.get('/me', requireAuth, getMe);
userRouter.patch('/me', requireAuth, validate({ body: updateProfileSchema }), updateMe);

/**
 * The customer profile on its short path - `GET /me` and `PATCH /me` at the API
 * root, which is what the storefront and the checkout talk to. Same two
 * handlers as above, so the two paths can never drift apart.
 */
export const meRouter = Router();

meRouter.get('/', requireAuth, getMe);
meRouter.patch('/', requireAuth, validate({ body: updateProfileSchema }), updateMe);
