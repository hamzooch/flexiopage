/**
 * Pose l'accroche et les prix sur une photo déjà générée.
 * Le modèle d'image garde le produit. Les mots viennent d'ici,
 * donc le dialecte et les montants restent exacts.
 */
import fs from 'fs';
import path from 'path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import type { CampaignCaption } from './landing-facts';

const FONT_FAMILY = 'Campaign Sans';
let fontReady = false;

function ensureFont(): void {
  if (fontReady) return;
  const candidates = [
    path.resolve(__dirname, '../../assets/fonts/NotoSansArabic-Bold.ttf'),
    path.resolve(process.cwd(), 'assets/fonts/NotoSansArabic-Bold.ttf'),
    path.resolve(process.cwd(), 'flexiopage-backend/assets/fonts/NotoSansArabic-Bold.ttf'),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) throw new Error('Noto Sans Arabic font is missing');
  GlobalFonts.registerFromPath(file, FONT_FAMILY);
  fontReady = true;
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

type DrawCtx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

function fitSize(ctx: DrawCtx, text: string, maxWidth: number, preferred: number, min: number): number {
  let size = Math.floor(preferred);
  const floor = Math.floor(min);
  while (size > floor) {
    ctx.font = `700 ${size}px "${FONT_FAMILY}"`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return floor;
}

function drawCentered(
  ctx: DrawCtx,
  text: string,
  x: number,
  y: number,
  preferred: number,
  min: number,
  maxWidth: number,
  color: string,
): void {
  const size = fitSize(ctx, text, maxWidth, preferred, min);
  ctx.font = `700 ${size}px "${FONT_FAMILY}"`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = isArabic(text) ? 'rtl' : 'ltr';
  ctx.fillText(text, x, y);
}

function roundRect(ctx: DrawCtx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function paintCampaignCaption(
  image: Buffer,
  caption: CampaignCaption,
): Promise<Buffer> {
  const headline = caption.headline?.trim();
  if (!headline) return image;
  ensureFont();
  const bitmap = await loadImage(image);
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);

  const bandTop = Math.round(h * 0.58);
  const fade = ctx.createLinearGradient(0, bandTop, 0, h);
  fade.addColorStop(0, 'rgba(12,10,8,0)');
  fade.addColorStop(0.42, 'rgba(12,10,8,0.55)');
  fade.addColorStop(1, 'rgba(12,10,8,0.86)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, bandTop, w, h - bandTop);

  const maxWidth = w * 0.88;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = Math.max(8, Math.round(w * 0.012));
  if (caption.kicker?.trim()) {
    drawCentered(ctx, caption.kicker.trim(), w / 2, h * 0.72, w * 0.034, w * 0.02, maxWidth, 'rgba(255,255,255,0.82)');
  }
  const headlineY = caption.strike ? h * 0.82 : caption.kicker ? h * 0.84 : h * 0.8;
  drawCentered(ctx, headline, w / 2, headlineY, w * 0.078, w * 0.034, maxWidth, '#fffaf3');

  if (caption.strike?.trim()) {
    const strike = caption.strike.trim();
    const y = h * 0.92;
    const size = fitSize(ctx, strike, maxWidth, w * 0.038, w * 0.02);
    ctx.font = `700 ${size}px "${FONT_FAMILY}"`;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    ctx.fillText(strike, w / 2, y);
    const width = ctx.measureText(strike).width;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,250,243,0.9)';
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.beginPath();
    ctx.moveTo(w / 2 - width / 2, y);
    ctx.lineTo(w / 2 + width / 2, y);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  const badge = caption.badge?.trim();
  if (badge) {
    const size = Math.round(w * 0.042);
    ctx.font = `700 ${size}px "${FONT_FAMILY}"`;
    ctx.direction = 'ltr';
    const textWidth = ctx.measureText(badge).width;
    const padX = size * 0.72;
    const bw = textWidth + padX * 2;
    const bh = size * 1.7;
    const x = w - bw - w * 0.05;
    const y = h * 0.06;
    ctx.fillStyle = '#f5b942';
    roundRect(ctx, x, y, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = '#1a1208';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, x + bw / 2, y + bh / 2 + size * 0.04);
  }

  return canvas.toBuffer('image/jpeg', 90);
}
