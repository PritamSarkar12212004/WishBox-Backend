import { asyncHandler } from '../../shared/asyncHandler.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { getSiteContent, patchSiteContent } from './content.service.js';
import type { ContentPatchInput } from './content.validation.js';

/** GET /content — the storefront's banner, footer and contact copy. */
export const getContent = asyncHandler(async (_req, res) => {
  const content = await getSiteContent();
  sendSuccess(res, content, { message: 'Website content' });
});

/** PATCH /admin/content — saves whole sections, or resets one. */
export const patchContent = asyncHandler(async (req, res) => {
  const content = await patchSiteContent(req.body as ContentPatchInput);
  sendSuccess(res, content, { message: 'Website content saved' });
});
