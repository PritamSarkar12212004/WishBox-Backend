import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { DEFAULT_SITE_CONTENT } from './content.defaults.js';
import type { AlertContent, ContactContent, FooterContent, HomeContent } from './content.types.js';

/**
 * Website content, as one document.
 *
 * The panel always reads and writes whole sections (the home hero, the alert
 * strip, the footer, the contact page), so a singleton keeps "what does the
 * site say?" to one lookup. The nested sections are `Mixed` because they are validated
 * by `content.validation.ts` before they ever reach the model: the schema
 * would otherwise be a third copy of the same shape, free to drift from the
 * two that actually decide what is accepted.
 */
export interface SiteContentAttributes {
  contentId: string;
  home: HomeContent;
  alert: AlertContent;
  footer: FooterContent;
  contact: ContactContent;
}

export type SiteContentDocument = HydratedDocument<SiteContentAttributes>;
export type SiteContentModelType = Model<SiteContentAttributes>;

/** The one and only content row. */
export const SITE_CONTENT_ID = 'site';

const siteContentSchema = new Schema<SiteContentAttributes>(
  {
    contentId: { type: String, required: true, unique: true, default: SITE_CONTENT_ID },
    home: { type: Schema.Types.Mixed, default: DEFAULT_SITE_CONTENT.home },
    alert: { type: Schema.Types.Mixed, default: DEFAULT_SITE_CONTENT.alert },
    footer: { type: Schema.Types.Mixed, default: DEFAULT_SITE_CONTENT.footer },
    contact: { type: Schema.Types.Mixed, default: DEFAULT_SITE_CONTENT.contact },
  },
  { versionKey: false, minimize: false },
);

export const SiteContentModel = model<SiteContentAttributes>(
  'SiteContent',
  siteContentSchema,
);
