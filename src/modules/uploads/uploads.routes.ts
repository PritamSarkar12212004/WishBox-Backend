import { Router } from 'express';
import { validate } from '../../middleware/index.js';
import { deleteUpload, getUploadStatus, storeUpload } from './uploads.controller.js';
import { deleteUploadQuerySchema, uploadImageSchema } from './uploads.validation.js';

/**
 * Media management, for admins only.
 *
 * There is no public route here and there will not be one: every call signs with
 * `CLOUDINARY_API_SECRET`, and a route that spends a secret is not something a
 * shopper may reach. Mounted at `/admin/uploads`, under the admin router's
 * `requireAuth, requireAdmin` gate.
 */
export const uploadAdminRouter = Router();

uploadAdminRouter.get('/status', getUploadStatus);
uploadAdminRouter.post('/', validate({ body: uploadImageSchema }), storeUpload);
uploadAdminRouter.delete('/', validate({ query: deleteUploadQuerySchema }), deleteUpload);
