/**
 * A snapshot of the storefront catalogue, used only to seed admin history.
 *
 * The catalogue itself lives in the storefront's own store - the admin panel
 * reads and writes it there, and no product collection exists on this side. The
 * seed still needs the real product ids, names, brands, images and prices, or
 * the seeded orders, reviews and restocks would reference products the panel
 * cannot resolve. Keep this in step with
 * `src/modules/products/data/catalogData.ts` in the frontend.
 */

export interface SeedProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  mrp: number;
  image: string;
}

const img = (id: string, w: number, h: number) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

export const SEED_CATALOG: SeedProduct[] = [
  {
    id: 'premium-handmade-decorative-paper',
    name: 'Premium Handmade Decorative Paper Sheets',
    brand: 'PaperCraft',
    category: 'paper-craft',
    price: 249,
    mrp: 399,
    image: img('photo-1586075010923-2dd4570fb338', 600, 750),
  },
  {
    id: 'matte-pastel-paper-pack',
    name: 'Matte Pastel Paper Sheets – Decorative Pack',
    brand: 'VibeCrafts',
    category: 'paper-craft',
    price: 199,
    mrp: 299,
    image: img('photo-1517842645767-c639042777db', 600, 750),
  },
  {
    id: 'origami-paper-200-sheets',
    name: 'Origami Paper – 200 Multi Colour Sheets',
    brand: 'PaperCraft',
    category: 'paper-craft',
    price: 299,
    mrp: 499,
    image: img('photo-1513364776144-60967b0f800f', 600, 750),
  },
  {
    id: 'handmade-paper-gift-bags',
    name: 'Handmade Paper Gift Bags – Set of 12',
    brand: 'Lume',
    category: 'paper-craft',
    price: 349,
    mrp: 599,
    image: img('photo-1519197924294-4ba991a11128', 600, 750),
  },
  {
    id: 'craft-paper-multipack',
    name: 'Craft Paper Multipack – 50 Sheets',
    brand: 'ArtisanHome',
    category: 'paper-craft',
    price: 149,
    mrp: 249,
    image: img('photo-1452802447250-470a88ac82bc', 600, 750),
  },
  {
    id: 'decorative-ribbon-spool',
    name: 'Decorative Craft Ribbon Spool',
    brand: 'ArtisanHome',
    category: 'paper-craft',
    price: 129,
    mrp: 199,
    image: img('photo-1457365050282-c53d772ef8b2', 600, 750),
  },
  {
    id: 'gold-foil-wrapping-roll',
    name: 'Gold Foil Wrapping Paper Roll',
    brand: 'ArtisanHome',
    category: 'paper-craft',
    price: 149,
    mrp: 249,
    image: img('photo-1543007630-9710e4a00a20', 600, 750),
  },
  {
    id: 'premium-cardstock-250gsm',
    name: 'Premium Cardstock – 250 GSM',
    brand: 'Timeless',
    category: 'paper-craft',
    price: 229,
    mrp: 379,
    image: img('photo-1584697964358-3e14ca57658b', 600, 750),
  },
  {
    id: 'rose-gold-shimmer-paper',
    name: 'Rose Gold Shimmer Paper Sheets',
    brand: 'PaperCraft',
    category: 'paper-craft',
    price: 259,
    mrp: 399,
    image: img('photo-1607083206968-13611e3d76db', 600, 750),
  },
  {
    id: 'led-round-wall-mirror',
    name: 'Modern Designer LED Round Wall Mirror',
    brand: 'VibeCrafts',
    category: 'home-decor',
    price: 5270,
    mrp: 9999,
    image: img('photo-1618220179428-22790b461013', 600, 750),
  },
  {
    id: 'ceramic-vase-set',
    name: 'Handmade Ceramic Vase Set',
    brand: 'ArtisanHome',
    category: 'home-decor',
    price: 1899,
    mrp: 2800,
    image: img('photo-1578749556568-bc2c40e68b61', 600, 750),
  },
  {
    id: 'wooden-wall-clock',
    name: 'Elegant Wooden Wall Clock',
    brand: 'Timeless',
    category: 'clocks',
    price: 2999,
    mrp: 4500,
    image: img('photo-1563861826100-9cb868fdbe1c', 600, 750),
  },
  {
    id: 'minimalist-desk-lamp',
    name: 'Minimalist Desk Lamp',
    brand: 'Lume',
    category: 'lighting',
    price: 2199,
    mrp: 3200,
    image: img('photo-1507473885765-e6ed057f782c', 600, 750),
  },
];
