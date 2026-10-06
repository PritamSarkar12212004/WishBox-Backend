import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { userRouter } from '../modules/user/user.routes.js';
import { sendSuccess } from '../shared/apiResponse.js';
import { env } from '../config/env.js';


export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  sendSuccess(res, {
    name: 'Wishbox API',
    version: 'v1',
    prefix: env.API_PREFIX,
  }, { message: 'Wishbox API is running' });
});

apiRouter.use('/health', healthRouter);


apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
