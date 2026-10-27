/**
 * Puts the website's data into the database.
 *
 * Run with: `npm run website:seed` (add `--force` to reset to the shipped
 * values again).
 *
 * Two documents, because the storefront reads two:
 *
 *  - **Site content** (`sitecontents`): the home hero, the alert strip, the
 *    footer (store name, tagline, phone, email, address, Instagram and WhatsApp
 *    links) and the contact page (WhatsApp/email cards, studio address, support
 *    hours, social link, topics).
 *  - **Store settings** (`adminsettings`): store name, support email and phone,
 *    plus the operational values the panel and storefront share.
 *
 * Both already fall back to shipped defaults, but a default lives in the code
 * until someone saves the screen once. This writes the rows, so every string
 * the shop renders is a record in MongoDB from the first run and the admin's
 * Website screens are editing a real row.
 *
 * Safe to re-run: it only creates what is missing. `--force` overwrites with
 * the shipped defaults - the same thing the panel's Reset buttons do.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createChildLogger } from '../src/config/logger.js';
import { DEFAULT_SITE_CONTENT } from '../src/modules/content/content.defaults.js';
import { SITE_CONTENT_ID, SiteContentModel } from '../src/modules/content/content.model.js';
import { getSiteContent } from '../src/modules/content/content.service.js';
import {
  ADMIN_SETTINGS_ID,
  AdminSettingModel,
  DEFAULT_ADMIN_SETTINGS,
} from '../src/modules/admin/models/setting.model.js';
import { getSettings } from '../src/modules/admin/admin.service.js';

const log = createChildLogger('website-seed');

async function seedSiteContent(force: boolean): Promise<string> {
  const existing = await SiteContentModel.findOne({ contentId: SITE_CONTENT_ID }).lean();
  if (existing && !force) return 'kept';

  await SiteContentModel.findOneAndUpdate(
    { contentId: SITE_CONTENT_ID },
    { $set: { contentId: SITE_CONTENT_ID, ...structuredClone(DEFAULT_SITE_CONTENT) } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  return existing ? 'reset' : 'created';
}

async function seedSettings(force: boolean): Promise<string> {
  const existing = await AdminSettingModel.findOne({ settingId: ADMIN_SETTINGS_ID }).lean();
  if (existing && !force) return 'kept';

  await AdminSettingModel.findOneAndUpdate(
    { settingId: ADMIN_SETTINGS_ID },
    { $set: { settingId: ADMIN_SETTINGS_ID, ...structuredClone(DEFAULT_ADMIN_SETTINGS) } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  return existing ? 'reset' : 'created';
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  await connectDatabase();

  const contentAction = await seedSiteContent(force);
  const settingsAction = await seedSettings(force);

  // Read both back through the same functions the API uses, so the log proves
  // the values in the database are what a page will get - not the code defaults.
  const storedContent = await getSiteContent();
  const storedSettings = await getSettings();

  log.info(
    {
      contentAction,
      settingsAction,
      home: {
        eyebrow: storedContent.home.hero.eyebrow,
        title: storedContent.home.hero.title,
      },
      alert: {
        phone: storedContent.alert.phone,
        email: storedContent.alert.email,
        messages: storedContent.alert.messages.length,
      },
      footer: {
        storeName: storedContent.footer.storeName,
        phone: storedContent.footer.phone,
        email: storedContent.footer.email,
        address: storedContent.footer.address,
        instagramUrl: storedContent.footer.instagramUrl,
        whatsappUrl: storedContent.footer.whatsappUrl,
        links:
          storedContent.footer.shopLinks.length + storedContent.footer.companyLinks.length,
      },
      contact: {
        whatsapp: storedContent.contact.whatsapp.number,
        email: storedContent.contact.email.address,
        studioLines: storedContent.contact.studio.lines.length,
        supportHours: storedContent.contact.hours.rows.length,
        instagramUrl: storedContent.contact.social.instagramUrl,
        topics: storedContent.contact.topics.length,
      },
      settings: {
        storeName: storedSettings.storeName,
        supportEmail: storedSettings.supportEmail,
        supportPhone: storedSettings.supportPhone,
      },
    },
    'Website data is in the database',
  );

  await disconnectDatabase();
}

main().catch(async (error: unknown) => {
  log.error({ message: error instanceof Error ? error.message : String(error) }, 'Seed failed');
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
