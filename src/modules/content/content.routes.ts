import { Router } from 'express';
import { getContent } from './content.controller.js';

/**
 * The storefront's website content.
 *
 * Public on purpose: the alert bar, footer and contact page are the same for
 * every visitor and carry no account data. Editing them lives under
 * `/admin/content`, behind the admin gate.
 */
export const contentRouter = Router();

contentRouter.get('/', getContent);
