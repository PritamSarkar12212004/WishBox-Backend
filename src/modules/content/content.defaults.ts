import type { SiteContent } from './content.types.js';

/**
 * The content a fresh database serves.
 *
 * These are the shipped storefront strings: a browser sees the real site before
 * an admin has saved anything, and the same values are what a Reset restores.
 * The storefront keeps its own copy only as the pre-fetch fallback, so the API
 * is the one authority once it answers.
 */
export const DEFAULT_SITE_CONTENT: SiteContent = {
  home: {
    hero: {
      eyebrow: 'Handmade in Jaipur',
      title: 'Paper & décor for the moments you want to remember',
      lead: 'Small-batch handmade paper, gift wrap and home décor — pressed, cut and finished by hand, then shipped across India.',
    },
  },

  alert: {
    phone: '+91 98765 43210',
    // One storefront address everywhere: alert, footer, contact and settings.
    email: 'hello@wishbox.in',
    messages: [
      { id: 'paper-lanterns', text: '50% OFF PAPER LANTERNS' },
      { id: 'origami-sets', text: 'BUY 2 GET 1 FREE ON ORIGAMI SETS' },
      { id: 'wall-art', text: '30% OFF WALL ART' },
      { id: 'craft-paper', text: 'CRAFT PAPER FROM ₹299' },
      { id: 'spring-flowers', text: 'NEW SPRING FLOWER COLLECTION' },
      { id: 'bulk-orders', text: 'EXTRA 15% OFF BULK ORDERS' },
      { id: 'gift-wrap', text: 'GIFT WRAP 40% OFF TODAY' },
    ],
    marqueeSeconds: 30,
  },

  footer: {
    storeName: 'WishBox',
    tagline:
      'Handmade paper decorations for your home and events — crafted with love, inspired by nature.',
    instagramUrl: 'https://www.instagram.com/',
    whatsappUrl: 'https://wa.me/919876543210',
    shopHeading: 'Shop',
    shopLinks: [
      { id: 'shop-all', label: 'Shop All', to: '/shop' },
      { id: 'wishlist', label: 'Wishlist', to: '/wishlist' },
      { id: 'cart', label: 'Cart', to: '/cart' },
      { id: 'order-history', label: 'Order History', to: '/history' },
    ],
    companyHeading: 'Company',
    companyLinks: [{ id: 'contact', label: 'Contact', to: '/contact' }],
    contactHeading: 'Get in touch',
    address: '123 Craft Lane, Jaipur, India',
    phone: '+91 98765 43210',
    email: 'hello@wishbox.in',
    subscribeHeading: 'Offers & drops on WhatsApp',
    copyright: '© 2026 WishBox — All rights reserved.',
  },

  contact: {
    hero: {
      eyebrow: 'WishBox support',
      title: "Let's talk — we are a message away",
      lead: 'Questions about an order, a custom size, bulk pricing or your next DIY project — pick whichever channel suits you. A real human from the studio reads every message.',
      pills: {
        whatsapp: 'WhatsApp · usually a couple of hours',
        email: 'Email · within one business day',
        location: 'Based in Jaipur, India',
      },
    },
    whatsapp: {
      kicker: 'WhatsApp us',
      number: '+91 98765 43210',
      bestFor: 'Quick questions, order updates & design references',
      meta: 'Mon–Sat · 10:00 AM – 7:00 PM IST',
      buttonLabel: 'Start chat',
      prefill: 'Hi WishBox! I need help with ',
      copyLabel: 'Copy number',
    },
    email: {
      kicker: 'Email us',
      address: 'hello@wishbox.in',
      bestFor: 'Bulk orders, invoices, collaborations & press',
      meta: 'Replies within one business day',
      buttonLabel: 'Send an email',
      subject: 'WishBox enquiry',
      copyLabel: 'Copy address',
    },
    form: {
      heading: 'Send us a message',
      intro:
        'Tell us what you need and we will reply on email — or on WhatsApp if you share your number.',
    },
    call: {
      title: 'Call us',
      phone: '+91 98765 43210',
      note: 'Quickest for order updates and delivery questions.',
    },
    studio: {
      title: 'Visit the studio',
      lines: ['123 Craft Lane, C-Scheme', 'Jaipur, Rajasthan 302001', 'India'],
      directionsLabel: 'Get directions',
      directionsUrl: 'https://www.google.com/maps/search/?api=1&query=Jaipur%2C%20Rajasthan',
    },
    hours: {
      title: 'Support hours',
      rows: [
        { id: 'weekdays', days: 'Monday – Friday', time: '10:00 AM – 7:00 PM IST' },
        { id: 'saturday', days: 'Saturday', time: '10:00 AM – 4:00 PM IST' },
        { id: 'sunday', days: 'Sunday', time: 'Closed' },
      ],
    },
    social: {
      title: 'Follow along',
      note: 'New drops, studio notes and behind-the-scenes reels.',
      instagramUrl: 'https://www.instagram.com/',
    },
    topics: [
      { id: 'order-help', label: 'Order or delivery help' },
      { id: 'product', label: 'Product question' },
      { id: 'bulk', label: 'Bulk / custom order' },
      { id: 'return', label: 'Return or refund' },
      { id: 'collab', label: 'Collaboration or press' },
      { id: 'other', label: 'Something else' },
    ],
  },
};
