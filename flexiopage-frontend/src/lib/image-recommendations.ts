/**
 * Image size recommendations for different content types.
 * Based on the comprehensive sizing guide.
 */

export interface ImageSizeRecommendation {
  width: number;
  height: number;
  maxFileSizeKb: number;
  formats?: string[];
}

export const imageSizes = {
  // Page hero images (main banner)
  heroDesktop: {
    width: 1920,
    height: 600,
    maxFileSizeKb: 500,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,

  heroMobile: {
    width: 750,
    height: 1000,
    maxFileSizeKb: 300,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,

  // Storefront section hero images (larger aspect ratio)
  storefrontHeroDesktop: {
    width: 1920,
    height: 1080,
    maxFileSizeKb: 600,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,

  storefrontHeroMobile: {
    width: 1080,
    height: 1350,
    maxFileSizeKb: 400,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,

  // Product images
  productMain: {
    width: 1000,
    height: 1000,
    maxFileSizeKb: 400,
    formats: ['JPG', 'PNG'],
  } as ImageSizeRecommendation,

  productThumbnail: {
    width: 500,
    height: 500,
    maxFileSizeKb: 150,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,

  productZoom: {
    width: 2000,
    height: 2000,
    maxFileSizeKb: 800,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,

  productGallery: {
    width: 1200,
    height: 1200,
    maxFileSizeKb: 500,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,

  // Collection/Category images
  collectionBanner: {
    width: 1200,
    height: 400,
    maxFileSizeKb: 350,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,

  collectionCard: {
    width: 400,
    height: 500,
    maxFileSizeKb: 200,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,

  // Profile/Avatar images
  logo: {
    width: 500,
    height: 500,
    maxFileSizeKb: 200,
    formats: ['PNG'],
  } as ImageSizeRecommendation,

  profilePhoto: {
    width: 300,
    height: 300,
    maxFileSizeKb: 150,
    formats: ['JPG', 'PNG'],
  } as ImageSizeRecommendation,

  favicon: {
    width: 192,
    height: 192,
    maxFileSizeKb: 50,
    formats: ['PNG'],
  } as ImageSizeRecommendation,

  // Promo/CTA banners
  promoBannerHorizontal: {
    width: 1200,
    height: 300,
    maxFileSizeKb: 300,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,

  promoBannerSquare: {
    width: 300,
    height: 300,
    maxFileSizeKb: 150,
    formats: ['JPG', 'WebP'],
  } as ImageSizeRecommendation,
};
