import { Router } from 'express';
import { requireAuth, validate } from '../../middleware/index.js';
import { requireAdmin } from './admin.access.js';
import {
  deleteReview,
  getDataset,
  getSettings,
  getSession,
  patchOrder,
  patchReturn,
  patchReview,
  patchSettings,
} from './admin.controller.js';
import {
  adminIdParamSchema,
  orderPatchSchema,
  returnPatchSchema,
  reviewPatchSchema,
  settingsPatchSchema,
} from './admin.validation.js';

export const adminRouter = Router();

/**
 * The whole panel hangs off this pair: `requireAuth` establishes who is asking,
 * and `requireAdmin` decides whether that is enough. Applying it once, here,
 * means a new route cannot be added without the gate by accident.
 */
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/session', getSession);
adminRouter.get('/dataset', getDataset);

adminRouter.get('/settings', getSettings);
adminRouter.patch('/settings', validate({ body: settingsPatchSchema }), patchSettings);

adminRouter.patch(
  '/orders/:id',
  validate({ params: adminIdParamSchema, body: orderPatchSchema }),
  patchOrder,
);
adminRouter.patch(
  '/returns/:id',
  validate({ params: adminIdParamSchema, body: returnPatchSchema }),
  patchReturn,
);
adminRouter.patch(
  '/reviews/:id',
  validate({ params: adminIdParamSchema, body: reviewPatchSchema }),
  patchReview,
);
adminRouter.delete('/reviews/:id', validate({ params: adminIdParamSchema }), deleteReview);
