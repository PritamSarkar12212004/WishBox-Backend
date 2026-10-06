import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { UnauthorizedError } from '../../shared/errors.js';
import { toPublicUser } from '../user/user.model.js';
import * as adminService from './admin.service.js';
import type {
  AdminOrderPatchInput,
  AdminReviewPatchInput,
  AdminReturnPatchInput,
  AdminSettingsPatchInput,
} from './admin.validation.js';

/**
 * GET /admin/session
 *
 * Confirms to the panel that its token really does carry admin access, and
 * hands back the identity every audit trail will be stamped with. The panel
 * calls it once on load rather than trusting the role it has in local storage.
 */
export const getSession = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  sendSuccess(res, { user: toPublicUser(req.user), isAdmin: true }, { message: 'Admin session' });
});

/** GET /admin/dataset - everything the panel charts, in one round trip. */
export const getDataset = asyncHandler(async (_req, res) => {
  const dataset = await adminService.getDataset();
  sendSuccess(res, dataset, { message: 'Admin dataset' });
});

/** PATCH /admin/orders/:id */
export const patchOrder = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  // `validate({ params })` has already proved this is a single string; Express
  // only types a path segment as `string | string[]`.
  const order = await adminService.patchOrder(
    String(req.params.id),
    req.body as AdminOrderPatchInput,
    req.user.name,
  );
  sendSuccess(res, order, { message: `Order ${order.id} updated` });
});

/** PATCH /admin/returns/:id */
export const patchReturn = asyncHandler(async (req, res) => {
  const { status } = req.body as AdminReturnPatchInput;
  const updated = await adminService.patchReturn(String(req.params.id), status);
  sendSuccess(res, updated, { message: `Return ${updated.id} is now ${status}` });
});

/** PATCH /admin/reviews/:id */
export const patchReview = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  const review = await adminService.patchReview(
    String(req.params.id),
    req.body as AdminReviewPatchInput,
    req.user.name,
  );
  sendSuccess(res, review, { message: 'Review updated' });
});

/** DELETE /admin/reviews/:id */
export const deleteReview = asyncHandler(async (req, res) => {
  await adminService.deleteReview(String(req.params.id));
  sendSuccess(res, null, { message: 'Review deleted' });
});

/** GET /admin/settings */
export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await adminService.getSettings();
  sendSuccess(res, settings, { message: 'Store settings' });
});

/** PATCH /admin/settings - merges a partial change. */
export const patchSettings = asyncHandler(async (req, res) => {
  const settings = await adminService.patchSettings(req.body as AdminSettingsPatchInput);
  sendSuccess(res, settings, { message: 'Settings saved' });
});
