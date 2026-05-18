import { Router } from 'express';
import * as storeController from '../controllers/store.controller';
import * as productController from '../controllers/product.controller';
import * as pageController from '../controllers/page.controller';
import * as orderController from '../controllers/order.controller';
import * as mediaController from '../controllers/media.controller';
import * as customerController from '../controllers/customer.controller';
import * as collectionController from '../controllers/collection.controller';
import * as couponController from '../controllers/coupon.controller';
import * as subscriberController from '../controllers/subscriber.controller';
import * as reviewController from '../controllers/review.controller';
import * as abandonedCartController from '../controllers/abandoned-cart.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireStoreAccess } from '../middleware/storeAccess';
import { sanitizeMiddleware } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);
router.use(sanitizeMiddleware);

router.post('/', storeController.createStore);
router.get('/', storeController.listStores);

router.use('/:storeId', requireStoreAccess);

router.get('/:storeId', storeController.getStore);
router.patch('/:storeId', storeController.updateStore);
router.get('/:storeId/analytics', storeController.getStoreAnalyticsController);
router.get('/:storeId/analytics/rich', storeController.getStoreAnalyticsRichController);
router.get('/:storeId/tracking', storeController.getStoreTrackingController);

// Custom domain
router.get('/:storeId/domain-target', storeController.getDomainTargetController);
router.post('/:storeId/verify-domain', storeController.verifyDomainController);
router.post('/:storeId/check-domain', storeController.previewDomainController);

// Integrations
router.post('/:storeId/integrations/sheets/test', storeController.testSheetsController);

// Nested resources
router.get('/:storeId/products', productController.listProducts);
router.post('/:storeId/products', productController.createProduct);
router.post('/:storeId/products/generate-description', productController.generateProductDescription);
router.get('/:storeId/products/:productId', productController.getProduct);
router.patch('/:storeId/products/:productId', productController.updateProduct);
router.delete('/:storeId/products/:productId', productController.deleteProduct);

router.get('/:storeId/pages', pageController.listPages);
router.get('/:storeId/pages/templates/list', pageController.getTemplates);
router.post('/:storeId/pages/generate-ai', pageController.generateAiPage);
router.post('/:storeId/pages/generate-from-product', pageController.generateFromProduct);
router.post('/:storeId/pages/generate-from-product/async', pageController.generateFromProductAsync);
router.post('/:storeId/pages/generate-from-image', pageController.generateFromImage);
router.post('/:storeId/pages/generate-from-image/async', pageController.generateFromImageAsync);
router.post('/:storeId/pages/generate-poster', pageController.generatePosterPage);
router.post('/:storeId/pages/generate-landing-image', pageController.generateLandingImagePage);
router.post('/:storeId/pages/from-template', pageController.getSectionsFromTemplateId);
router.post('/:storeId/pages', pageController.createPage);
router.get('/:storeId/pages/:pageId', pageController.getPage);
router.patch('/:storeId/pages/:pageId', pageController.updatePage);
router.delete('/:storeId/pages/:pageId', pageController.deletePage);

router.get('/:storeId/orders', orderController.listOrders);
router.post('/:storeId/orders', orderController.createOrder);
router.get('/:storeId/orders/:orderId', orderController.getOrder);
router.patch('/:storeId/orders/:orderId/payment', orderController.updateOrderPaymentStatus);
router.patch('/:storeId/orders/:orderId/fulfillment', orderController.updateOrderFulfillment);
router.post('/:storeId/orders/:orderId/dispatch', orderController.dispatchOrderToCourier);
router.patch('/:storeId/orders/:orderId/manual-status', orderController.manualStatusOverride);
router.patch('/:storeId/orders/:orderId/confirmation', orderController.updateConfirmationStatus);

router.post('/:storeId/media', mediaController.uploadSingle, mediaController.uploadMedia);
router.get('/:storeId/media', mediaController.listMedia);

router.get('/:storeId/customers', customerController.listCustomers);

// Collections (groups of products with their own storefront page).
router.get('/:storeId/collections', collectionController.listCollections);
router.post('/:storeId/collections', collectionController.createCollection);
router.get('/:storeId/collections/:collectionId', collectionController.getCollection);
router.patch('/:storeId/collections/:collectionId', collectionController.updateCollection);
router.delete('/:storeId/collections/:collectionId', collectionController.deleteCollection);

// Coupons (promotional codes typed in the COD form).
router.get('/:storeId/coupons', couponController.listCoupons);
router.post('/:storeId/coupons', couponController.createCoupon);
router.get('/:storeId/coupons/:couponId', couponController.getCoupon);
router.patch('/:storeId/coupons/:couponId', couponController.updateCoupon);
router.delete('/:storeId/coupons/:couponId', couponController.deleteCoupon);

// Newsletter subscribers (welcome popup + manual list management).
// CSV export is placed before the /:subscriberId DELETE so the literal
// "export.csv" path doesn't get caught by the param matcher.
router.get('/:storeId/subscribers', subscriberController.listSubscribers);
router.get('/:storeId/subscribers/export.csv', subscriberController.exportSubscribersCsv);
router.delete('/:storeId/subscribers/:subscriberId', subscriberController.deleteSubscriber);

// Reviews (product reviews moderated by the seller).
router.get('/:storeId/reviews', reviewController.listReviews);
router.patch('/:storeId/reviews/:reviewId', reviewController.updateReview);
router.delete('/:storeId/reviews/:reviewId', reviewController.deleteReview);

// Abandoned carts (leads captured from the COD form mid-fill).
router.get('/:storeId/abandoned-carts', abandonedCartController.listAbandonedCarts);
router.delete('/:storeId/abandoned-carts/:cartId', abandonedCartController.deleteAbandonedCart);

export default router;
