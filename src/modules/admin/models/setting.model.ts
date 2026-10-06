import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

/**
 * Store-wide settings the admin panel edits.
 *
 * Kept as a single document rather than one key per row: the panel always reads
 * and writes the whole object, so a singleton keeps the read to one lookup and
 * makes "what is the current configuration?" answerable at a glance.
 */
export interface AdminSettings {
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  /** Live products at or below this stock level are "low stock". */
  lowStockThreshold: number;
  freeShippingThreshold: number;
  codEnabled: boolean;
  defaultCourier: string;
  /** Id of the selected website theme - see the panel's `themeConst`. */
  websiteTheme: string;
  /** The UPI QR shoppers scan to pay: an image data URL, or a hosted URL. */
  paymentQr: string;
  /** When the QR was last replaced - 0 until the first upload. */
  paymentQrUpdatedAt: number;
}

/** The values the API serves before an admin has saved anything. */
export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  storeName: 'WishBox',
  supportEmail: 'support@papercraft.in',
  supportPhone: '+91 98765 43210',
  lowStockThreshold: 10,
  freeShippingThreshold: 999,
  codEnabled: true,
  defaultCourier: 'Delhivery',
  websiteTheme: 'papercraft',
  paymentQr: '',
  paymentQrUpdatedAt: 0,
};

export type AdminSettingsAttributes = AdminSettings & { settingId: string };
export type AdminSettingsDocument = HydratedDocument<AdminSettingsAttributes>;
export type AdminSettingsModelType = Model<AdminSettingsAttributes>;

/** The one and only settings row. */
export const ADMIN_SETTINGS_ID = 'store';

const settingSchema = new Schema<AdminSettingsAttributes>(
  {
    settingId: { type: String, required: true, unique: true, default: ADMIN_SETTINGS_ID },
    storeName: { type: String, default: DEFAULT_ADMIN_SETTINGS.storeName },
    supportEmail: { type: String, default: DEFAULT_ADMIN_SETTINGS.supportEmail },
    supportPhone: { type: String, default: DEFAULT_ADMIN_SETTINGS.supportPhone },
    lowStockThreshold: { type: Number, default: DEFAULT_ADMIN_SETTINGS.lowStockThreshold, min: 0 },
    freeShippingThreshold: {
      type: Number,
      default: DEFAULT_ADMIN_SETTINGS.freeShippingThreshold,
      min: 0,
    },
    codEnabled: { type: Boolean, default: DEFAULT_ADMIN_SETTINGS.codEnabled },
    defaultCourier: { type: String, default: DEFAULT_ADMIN_SETTINGS.defaultCourier },
    websiteTheme: { type: String, default: DEFAULT_ADMIN_SETTINGS.websiteTheme },
    paymentQr: { type: String, default: '' },
    paymentQrUpdatedAt: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export const AdminSettingModel = model<AdminSettingsAttributes>('AdminSetting', settingSchema);

export function toPublicSettings(
  doc: AdminSettingsAttributes & { _id?: unknown },
): AdminSettings {
  const { _id, settingId, ...rest } = doc;
  return rest;
}
