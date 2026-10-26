import 'dotenv/config';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { storeImage } from '../src/services/cloudinary/index.js';
import { ProductModel } from '../src/modules/products/products.model.js';
import { CategoryModel } from '../src/modules/categories/categories.model.js';
import { CategoryCatalogueFileModel } from '../src/modules/categories/categories.file.model.js';
import { AdditionalCatalogueFileModel } from '../src/modules/categories/categories.additional-file.model.js';
import { AdminOrderModel } from '../src/modules/admin/models/order.model.js';
import { AdminReviewModel } from '../src/modules/admin/models/review.model.js';
import { AdminReturnModel } from '../src/modules/admin/models/return.model.js';
import { AdminSettingModel } from '../src/modules/admin/models/setting.model.js';

const dryRun = process.argv.includes('--dry-run');
const cloudName = env.CLOUDINARY_CLOUD_NAME;
const isCloudinary = (value: string) => value.startsWith(`https://res.cloudinary.com/${cloudName}/`);
const cache = new Map<string, Promise<string>>();
const failures: Array<{ area: string; reason: string }> = [];
const counts = new Map<string, number>();

function count(area: string) { counts.set(area, (counts.get(area) ?? 0) + 1); }
async function parallelMap<T>(values: T[], work: (value: T) => Promise<void>, concurrency = 8) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const value = values[cursor++];
      await work(value);
    }
  }));
}
function guessType(value: string, area: string): 'image' | 'video' | 'raw' {
  if (area.includes('catalogue')) return 'raw';
  if (/^data:application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)/i.test(value)) return 'raw';
  if (/\.(mp4|mov|webm|m3u8)(?:[?#]|$)/i.test(value)) return 'video';
  return 'image';
}
async function migrate(value: unknown, area: string, forcedType?: 'image' | 'video' | 'raw'): Promise<string> {
  if (typeof value !== 'string' || !value.trim()) return typeof value === 'string' ? value : '';
  const original = value.trim();
  if (isCloudinary(original)) return original;
  const resourceType = forcedType ?? guessType(original, area);
  if (dryRun) { count(area); return original; }
  const key = `${resourceType}:${original}`;
  const cached = cache.get(key);
  if (cached) { const url = await cached; count(area); return url; }
  const pending = (async () => {
    let uploadSource = original;
    const encodedSvg = original.match(/^data:image\/svg\+xml(?:;charset=[^,;]+)?,(.*)$/is);
    if (encodedSvg) {
      const svg = decodeURIComponent(encodedSvg[1]);
      uploadSource = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    }
    const publicId = `legacy-${createHash('sha256').update(original).digest('hex').slice(0, 32)}`;
    const result = await storeImage({ file: uploadSource, resourceType, folder: `wishbox/${area}`, publicId });
    return result.secureUrl;
  })();
  cache.set(key, pending);
  try {
    const url = await pending;
    count(area);
    return url;
  } catch (error) {
    cache.delete(key);
    failures.push({ area, reason: error instanceof Error ? error.message : 'upload failed' });
    return original;
  }
}

async function main() {
  if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME is missing');
  const databaseUri = new URL(env.MONGODB_URI);
  databaseUri.pathname = '/wishbox';
  await mongoose.connect(databaseUri.toString());
  try {
    const products = await ProductModel.find().lean();
    await parallelMap(products, async (doc) => {
      const set: Record<string, string | string[]> = {};
      for (const field of ['image', 'hoverImage', 'beforeImage', 'afterImage'] as const) {
        const next = await migrate(doc[field], `products/${field}`);
        if (next !== doc[field]) set[field] = next;
      }
      const gallery = await Promise.all((doc.gallery ?? []).map((url) => migrate(url, 'products/gallery')));
      if (gallery.some((url, i) => url !== doc.gallery?.[i])) set.gallery = gallery;
      if (doc.videoUrl) {
        const video = await migrate(doc.videoUrl, 'products/video', 'video');
        if (video !== doc.videoUrl) set.videoUrl = video;
      }
      if (!dryRun && Object.keys(set).length) await ProductModel.updateOne({ _id: doc._id }, { $set: set });
    });

    const orders = await AdminOrderModel.find().lean();
    await parallelMap(orders, async (doc) => {
      const set: Record<string, unknown> = {};
      for (const field of ['paymentScreenshot', 'refundScreenshot'] as const) {
        const next = await migrate(doc[field], `orders/${field}`);
        if (next !== doc[field]) set[field] = next;
      }
      const items = await Promise.all((doc.items ?? []).map(async (item) => ({ ...item, image: await migrate(item.image, 'orders/items') })));
      if (items.some((item, i) => item.image !== doc.items?.[i]?.image)) set.items = items;
      if (!dryRun && Object.keys(set).length) await AdminOrderModel.updateOne({ _id: doc._id }, { $set: set });
    }, 12);

    await parallelMap(await AdminReviewModel.find().lean(), async (doc) => {
      const image = await migrate(doc.image, 'reviews');
      if (!dryRun && image !== doc.image) await AdminReviewModel.updateOne({ _id: doc._id }, { $set: { image } });
    });
    await parallelMap(await AdminReturnModel.find().lean(), async (doc) => {
      const image = await migrate(doc.image, 'returns');
      if (!dryRun && image !== doc.image) await AdminReturnModel.updateOne({ _id: doc._id }, { $set: { image } });
    });
    const settings = await AdminSettingModel.find().lean();
    await parallelMap(settings, async (doc) => {
      const paymentQr = await migrate(doc.paymentQr, 'settings', 'image');
      if (!dryRun && paymentQr !== doc.paymentQr) await AdminSettingModel.updateOne({ _id: doc._id }, { $set: { paymentQr } });
    });

    for (const category of await CategoryModel.find().lean()) {
      if (category.catalogue && !isCloudinary(category.catalogue.url)) {
        let raw = category.catalogue.url;
        let localFile: { bytes: Buffer; fileName: string } | null = null;
        if (raw.includes('/catalogue/file')) {
          const stored = await CategoryCatalogueFileModel.findOne({ slug: category.slug }).lean();
          if (stored) {
            localFile = { bytes: stored.bytes, fileName: stored.fileName };
            raw = `data:${stored.contentType};base64,${stored.bytes.toString('base64')}`;
          }
        }
        const url = await migrate(raw, 'catalogues/official', 'raw');
        if (url !== raw && !dryRun) {
          await CategoryModel.updateOne({ _id: category._id }, { $set: { 'catalogue.url': url, ...(localFile ? { 'catalogue.fileName': localFile.fileName } : {}) }, $unset: { 'catalogue.publicId': 1 } });
          if (localFile) await CategoryCatalogueFileModel.deleteOne({ slug: category.slug });
        }
      }
      for (const item of category.additionalCatalogues ?? []) {
        if (isCloudinary(item.url)) continue;
        let raw = item.url;
        const local = raw.includes('/catalogues/') ? await AdditionalCatalogueFileModel.findOne({ slug: category.slug, catalogueId: item.id }).lean() : null;
        if (local) raw = `data:${local.contentType};base64,${local.bytes.toString('base64')}`;
        const url = await migrate(raw, 'catalogues/additional', 'raw');
        if (url !== raw && !dryRun) {
          await CategoryModel.updateOne({ _id: category._id, 'additionalCatalogues.id': item.id }, { $set: { 'additionalCatalogues.$.url': url, ...(local ? { 'additionalCatalogues.$.fileName': local.fileName } : {}) } });
          if (local) await AdditionalCatalogueFileModel.deleteOne({ slug: category.slug, catalogueId: item.id });
        }
      }
    }
  } finally { await mongoose.disconnect(); }
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'migration', migrated: Object.fromEntries(counts), failureCount: failures.length, failures: failures.slice(0, 20) }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch(async (error) => { console.error(error instanceof Error ? error.message : 'Migration failed'); await mongoose.disconnect(); process.exitCode = 1; });
