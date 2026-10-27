/**
 * Website content — the shapes the admin's Website screens edit and the
 * storefront renders.
 *
 * These are deliberately plain string/array shapes rather than free-form HTML:
 * every field is printed straight into a page, so the API validates the whole
 * object before it is stored and a shopper never sees a half-saved banner.
 *
 * The storefront's TypeScript types (`alertContent.ts`, `footerContent.ts`,
 * `contactContent.ts`) mirror these exactly. Keep the two sides in step.
 */

export type AlertMessage = { id: string; text: string };

export type AlertContent = {
  phone: string;
  email: string;
  messages: AlertMessage[];
  /** Seconds for one full marquee loop. */
  marqueeSeconds: number;
};

export type FooterLink = { id: string; label: string; to: string };

export type FooterContent = {
  storeName: string;
  tagline: string;
  instagramUrl: string;
  whatsappUrl: string;
  shopHeading: string;
  shopLinks: FooterLink[];
  companyHeading: string;
  companyLinks: FooterLink[];
  contactHeading: string;
  address: string;
  phone: string;
  email: string;
  subscribeHeading: string;
  copyright: string;
};

export type ContactTopic = { id: string; label: string };
export type SupportHour = { id: string; days: string; time: string };

export type ContactContent = {
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    pills: { whatsapp: string; email: string; location: string };
  };
  whatsapp: {
    kicker: string;
    number: string;
    bestFor: string;
    meta: string;
    buttonLabel: string;
    prefill: string;
    copyLabel: string;
  };
  email: {
    kicker: string;
    address: string;
    bestFor: string;
    meta: string;
    buttonLabel: string;
    subject: string;
    copyLabel: string;
  };
  form: { heading: string; intro: string };
  call: { title: string; phone: string; note: string };
  studio: {
    title: string;
    lines: string[];
    directionsLabel: string;
    directionsUrl: string;
  };
  hours: { title: string; rows: SupportHour[] };
  social: { title: string; note: string; instagramUrl: string };
  topics: ContactTopic[];
};

/** Everything the storefront renders that is edited in the panel. */
export type HomeContent = {
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
  };
};

export type SiteContent = {
  home: HomeContent;
  alert: AlertContent;
  footer: FooterContent;
  contact: ContactContent;
};

export type SiteContentSection = keyof SiteContent;
