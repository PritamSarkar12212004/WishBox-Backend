import { Router } from 'express';
import { requireAuth, validate } from '../../middleware/index.js';
import { categoryAdminRouter } from '../categories/categories.routes.js';
import { productAdminRouter } from '../products/products.routes.js';
import { uploadAdminRouter } from '../uploads/uploads.routes.js';
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

/**
 * The catalogue and its media live in their own modules, but their write routes
 * hang off this router on purpose: they need exactly this gate, and mounting
 * them here is what makes "every write under /admin is admin-only" true by
 * construction rather than by remembering to add a middleware.
 */
adminRouter.use('/products', productAdminRouter);
adminRouter.use('/categories', categoryAdminRouter);
adminRouter.use('/uploads', uploadAdminRouter);
