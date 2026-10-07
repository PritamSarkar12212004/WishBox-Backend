import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { HTTP_STATUS } from '../../consts/constants.js';
import * as uploadService from './uploads.service.js';
import type { DeleteUploadQueryInput, UploadImageInput } from './uploads.validation.js';

/** GET /uploads/status - can the server sign an upload right now? */
export const getUploadStatus = asyncHandler(async (_req, res) => {
  sendSuccess(res, uploadService.uploadStatus(), { message: 'Upload status' });
});

/**
 * POST /uploads
 *
 * A refusal is passed straight through: when Cloudinary answers "Upload preset
 * not found" or "Invalid Signature", that message *is* the fix, and the global
 * error handler turns it into a 502/503 with the same words.
 */
export const storeUpload = asyncHandler(async (req, res) => {
  const image = await uploadService.storeUpload(req.body as UploadImageInput);
  sendSuccess(res, image, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Image uploaded',
  });
});

/** DELETE /uploads?publicId=wishbox/photo */
export const deleteUpload = asyncHandler(async (req, res) => {
  const { publicId } = req.validatedQuery as DeleteUploadQueryInput;
  const removed = await uploadService.removeUpload(publicId);
  sendSuccess(res, removed, { message: 'Image removed' });
});
