/**
 * Alerte opérateur — email dès qu'une panne plateforme est détectée.
 *
 * Déclencheurs : réponse HTTP >= 500, promesse non gérée, exception non
 * rattrapée. Les erreurs de formulaire (400) ne partent pas.
 *
 * Un même incident (même route + même message) n'envoie qu'un email toutes
 * les 15 minutes, et le volume est plafonné pour ne pas saturer la boîte
 * si une panne se répète.
 *
 * Destinataire : ADMIN_ALERT_EMAIL, sinon l'adresse opérateur par défaut.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import { logger, setLoggedErrorSink } from '../lib/logger';
import { sendEmail } from './email.service';

const DEFAULT_ALERT_EMAIL = 'teyeb.hamza12@gmail.com';
const COOLDOWN_MS = 15 * 60_000;
const MAX_PER_HOUR = 8;

const lastSentAt = new Map<string, number>();
let hourWindowStart = Date.now();
let hourCount = 0;

export function platformAlertEmail(): string {
  return (process.env.ADMIN_ALERT_EMAIL || DEFAULT_ALERT_EMAIL).trim();
}

interface CapturedError {
  name?: string;
  message: string;
  code?: string;
  stack?: string;
  log?: string;
}

/** Erreurs logger.error({ err }) vues pendant la requête en cours. */
const requestErrors = new AsyncLocalStorage<CapturedError[]>();

function captureError(err: unknown, log?: string): CapturedError {
  if (err instanceof Error) {
    const codeValue = 'code' in err ? (err as { code?: unknown }).code : undefined;
    const code = typeof codeValue === 'string' || typeof codeValue === 'number' ? String(codeValue) : undefined;
    let stack = err.stack;
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) {
      stack = `${stack || err.message}\nCause: ${cause.name}: ${cause.message}\n${cause.stack || ''}`.trim();
    }
    return { name: err.name, message: err.message || 'Erreur inconnue', code, stack, log };
  }
  if (typeof err === 'string') return { message: err, log };
  try {
    return { message: JSON.stringify(err), log };
  } catch {
    return { message: String(err), log };
  }
}

function captureLoggedError(err: unknown, text?: string): void {
  const bucket = requestErrors.getStore();
  if (!bucket || bucket.length >= 5) return;
  const captured = captureError(err, text);
  const duplicate = bucket.some((item) => item.message === captured.message && item.log === captured.log);
  if (!duplicate) bucket.push(captured);
}

setLoggedErrorSink(captureLoggedError);

export interface PlatformProblem {
  source: string;
  message: string;
  statusCode?: number;
  method?: string;
  path?: string;
  stack?: string;
  /** Contexte du log, ex. « checkout init: payment init failed ». */
  log?: string;
  name?: string;
  code?: string;
  /** Phrase montrée au visiteur, si elle diffère du détail technique. */
  publicMessage?: string;
  requestId?: string;
  userId?: string;
  userRole?: string;
  ip?: string;
  params?: string;
  extras?: CapturedError[];
}

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [masqué]')
    .replace(/(api[_-]?key|password|secret|token|authorization|cookie)\s*[:=]\s*\S+/gi, '$1=[masqué]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (email) =>
      email.toLowerCase() === platformAlertEmail().toLowerCase() ? email : '[email masqué]',
    )
    .slice(0, 8000);
}

function block(title: string, body: string): string[] {
  return ['', title, redact(body.trim())];
}

function signature(problem: PlatformProblem): string {
  const path = (problem.path || '').split('?')[0];
  return [problem.source, problem.statusCode || '', problem.method || '', path, problem.message.slice(0, 160)].join('|');
}

function allowSend(key: string): boolean {
  const now = Date.now();
  if (now - hourWindowStart > 60 * 60_000) {
    hourWindowStart = now;
    hourCount = 0;
  }
  for (const [savedKey, at] of lastSentAt) {
    if (now - at > COOLDOWN_MS) lastSentAt.delete(savedKey);
  }
  const previous = lastSentAt.get(key);
  if (previous && now - previous < COOLDOWN_MS) return false;
  if (hourCount >= MAX_PER_HOUR) return false;
  lastSentAt.set(key, now);
  hourCount += 1;
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Envoie l'email d'alerte. Ne lève jamais — un échec d'envoi ne doit pas casser la requête. */
export async function reportPlatformProblem(problem: PlatformProblem): Promise<void> {
  const message = redact((problem.message || 'Erreur inconnue').trim());
  const key = signature({ ...problem, message });
  if (!allowSend(key)) {
    logger.warn({ source: problem.source, path: problem.path }, '[platform-alert] email regroupé (cooldown)');
    return;
  }

  const to = platformAlertEmail();
  const where = [problem.method, problem.path?.split('?')[0]].filter(Boolean).join(' ') || problem.source;
  const subject = `[FlexioPage] Problème plateforme — ${where}`.slice(0, 140);
  const headline = [
    problem.name && problem.name !== 'Error' ? problem.name : '',
    problem.code ? `code ${problem.code}` : '',
  ].filter(Boolean).join(' — ');
  const technical = [headline, problem.log, message].filter(Boolean).join('\n');
  const stack = problem.stack ? redact(problem.stack).split('\n').slice(0, 40).join('\n') : '';
  const extras = (problem.extras || [])
    .filter((item) => item.message && item.message !== message)
    .slice(0, 4)
    .map((item, index) => {
      const head = [item.log, item.name, item.code ? `code ${item.code}` : ''].filter(Boolean).join(' — ');
      const itemStack = item.stack ? redact(item.stack).split('\n').slice(0, 20).join('\n') : '';
      return [`#${index + 1} ${head}`, item.message, itemStack].filter(Boolean).join('\n');
    });
  const lines = [
    'Un problème a été détecté sur FlexioPage.',
    '',
    `Quand : ${new Date().toISOString()}`,
    `Environnement : ${process.env.NODE_ENV || 'development'}`,
    `Source : ${problem.source}`,
    ...(problem.statusCode ? [`Statut HTTP : ${problem.statusCode}`] : []),
    ...(where !== problem.source ? [`Requête : ${where}`] : []),
    ...(problem.requestId ? [`Id requête : ${problem.requestId}`] : []),
    ...(problem.userId ? [`Utilisateur : ${problem.userId}${problem.userRole ? ` (${problem.userRole})` : ''}`] : []),
    ...(problem.ip ? [`IP : ${problem.ip}`] : []),
    ...(problem.params ? [`Paramètres : ${problem.params}`] : []),
    ...(problem.publicMessage && problem.publicMessage !== message
      ? block('Message affiché au client :', problem.publicMessage)
      : []),
    ...block('Détail technique :', technical),
    ...(stack ? block('Stack :', stack) : []),
    ...(extras.length ? block('Autres erreurs pendant la requête :', extras.join('\n\n')) : []),
    '',
    'Les répétitions identiques sont regroupées pendant 15 minutes.',
  ];
  const text = lines.join('\n');

  try {
    const result = await sendEmail({
      to,
      subject,
      text,
      html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5;background:#f7f7f7;padding:16px;border-radius:8px;">${escapeHtml(text)}</pre>`,
    });
    if (!result.ok) {
      logger.error({ error: result.error, to }, '[platform-alert] envoi email échoué');
      return;
    }
    logger.warn({ to, source: problem.source, path: problem.path, mock: result.id === 'mock' }, '[platform-alert] email envoyé');
  } catch (err) {
    logger.error({ err }, '[platform-alert] envoi email échoué');
  }
}

/**
 * Pose un listener sur chaque réponse. Une réponse >= 500 déclenche l'email.
 * Le handler d'erreur peut déposer le message technique dans
 * `res.locals.platformErrorMessage` / `platformErrorStack` avant d'écrire
 * la réponse publique.
 */
const SAFE_PARAMS = ['storeSlug', 'storeId', 'productSlug', 'productId', 'orderId', 'slug'];

export function platformAlertMiddleware(req: Request, res: Response, next: NextFunction): void {
  const bucket: CapturedError[] = [];
  requestErrors.run(bucket, () => {
    const originalJson = res.json.bind(res);
    res.json = ((body?: unknown) => {
      if (res.statusCode >= 500 && body && typeof body === 'object') {
        const payload = body as { error?: unknown; code?: unknown };
        if (typeof payload.error === 'string') {
          res.locals.platformPublicMessage = payload.error;
          if (!res.locals.platformErrorMessage) res.locals.platformErrorMessage = payload.error;
        }
        if (!res.locals.platformErrorCode && (typeof payload.code === 'string' || typeof payload.code === 'number')) {
          res.locals.platformErrorCode = String(payload.code);
        }
      }
      return originalJson(body);
    }) as Response['json'];

    res.on('finish', () => {
      if (res.statusCode < 500) return;
      const path = (req.originalUrl || req.path || '').split('?')[0];
      if (path === '/health') return;
      const logged = bucket[0];
      const handlerMessage = typeof res.locals.platformErrorMessage === 'string' ? res.locals.platformErrorMessage : '';
      const publicMessage = typeof res.locals.platformPublicMessage === 'string' ? res.locals.platformPublicMessage : '';
      // Le JSON public ne doit pas masquer l'erreur technique loggée (message + stack).
      const message = logged?.message && (!handlerMessage || handlerMessage === publicMessage)
        ? logged.message
        : (handlerMessage || logged?.message || publicMessage || `Réponse HTTP ${res.statusCode}`);
      const stack = typeof res.locals.platformErrorStack === 'string' && res.locals.platformErrorStack
        ? res.locals.platformErrorStack
        : logged?.stack;
      const params = SAFE_PARAMS
        .map((key) => (req.params?.[key] ? `${key}=${req.params[key]}` : ''))
        .filter(Boolean)
        .join(', ');
      const user = (req as AuthRequest).user;
      void reportPlatformProblem({
        source: 'http',
        statusCode: res.statusCode,
        method: req.method,
        path,
        message,
        log: logged?.log,
        name: String(res.locals.platformErrorName || logged?.name || ''),
        code: String(res.locals.platformErrorCode || logged?.code || '') || undefined,
        stack,
        publicMessage: typeof res.locals.platformPublicMessage === 'string' ? res.locals.platformPublicMessage : undefined,
        requestId: typeof (req as Request & { id?: unknown }).id === 'string' ? (req as Request & { id: string }).id : undefined,
        userId: user?._id ? String(user._id) : undefined,
        userRole: user?.role,
        ip: req.ip,
        params: params || undefined,
        extras: bucket,
      });
    });

    next();
  });
}
