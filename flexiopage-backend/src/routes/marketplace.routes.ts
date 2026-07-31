/**
 * Marketplace — browse global (tout utilisateur authentifié). Voir les
 * routes store-scoped dans store.routes.ts pour l'acquisition (POST) et
 * la liste des acquisitions d'une boutique.
 */
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';
import * as marketplace from '../controllers/marketplace-vendor.controller';

const router = Router();
router.use(authMiddleware);
router.use(sanitizeMiddleware);

router.get('/products', marketplace.listCatalog);
router.get('/products/:id', marketplace.getCatalogItem);

export default router;
