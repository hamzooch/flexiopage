import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as productService from '../services/product.service';

export async function createProduct(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const storeId = store._id.toString();
  const body = req.body;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Product name is required' });
    return;
  }
  if (typeof body.price !== 'number' || body.price < 0) {
    res.status(400).json({ error: 'Valid price is required' });
    return;
  }
  const product = await productService.createProduct({
    storeId,
    name: body.name.trim(),
    description: body.description,
    type: body.type || 'physical',
    price: body.price,
    compareAtPrice: body.compareAtPrice,
    cost: body.cost,
    sku: body.sku,
    barcode: body.barcode,
    stock: body.stock ?? 0,
    trackInventory: body.trackInventory ?? true,
    allowBackorder: body.allowBackorder ?? false,
    variants: body.variants,
    images: body.images,
    digitalFileUrl: body.digitalFileUrl,
    digitalFileName: body.digitalFileName,
    weight: body.weight,
    weightUnit: body.weightUnit,
    isPublished: body.isPublished ?? false,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
  });
  res.status(201).json({ product });
}

export async function listProducts(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const publishedOnly = req.query.published === 'true';
  const products = await productService.getProductsByStore(store._id.toString(), { publishedOnly });
  res.json({ products });
}

export async function getProduct(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const productId = req.params.productId;
  const product = await productService.getProductById(productId, store._id.toString());
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json({ product });
}

export async function updateProduct(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const productId = req.params.productId;
  const body = req.body;
  const updated = await productService.updateProduct(productId, store._id.toString(), {
    name: body.name,
    description: body.description,
    type: body.type,
    price: body.price,
    compareAtPrice: body.compareAtPrice,
    cost: body.cost,
    sku: body.sku,
    stock: body.stock,
    trackInventory: body.trackInventory,
    allowBackorder: body.allowBackorder,
    variants: body.variants,
    images: body.images,
    digitalFileUrl: body.digitalFileUrl,
    digitalFileName: body.digitalFileName,
    weight: body.weight,
    weightUnit: body.weightUnit,
    isPublished: body.isPublished,
    seoTitle: body.seoTitle,
    seoDescription: body.seoDescription,
  });
  if (!updated) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json({ product: updated });
}

export async function deleteProduct(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const deleted = await productService.deleteProduct(req.params.productId, store._id.toString());
  if (!deleted) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json({ message: 'Product deleted' });
}
