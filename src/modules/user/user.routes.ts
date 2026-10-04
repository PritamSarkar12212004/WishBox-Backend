import { Router } from 'express';
import { requireAuth, validate } from '../../middleware/index.js';
import { getMe, updateMe } from './user.controller.js';
import { updateProfileSchema } from './user.validation.js';

/**
 * Account-connected routes. Every one of them sits behind `requireAuth`, so
 * the shopper must be signed in with a verified WhatsApp number.
 */
export const userRouter = Router();

userRouter.get('/me', requireAuth, getMe);
userRouter.patch('/me', requireAuth, validate({ body: updateProfileSchema }), updateMe);
