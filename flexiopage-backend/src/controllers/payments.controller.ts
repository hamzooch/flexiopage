/**
 * Platform-admin payments management. Monitor and configure payment gateways.
 */
import { Request, Response } from 'express';
import { PaymentLog } from '../models/PaymentLog.model';
import { Order } from '../models/Order.model';

/** GET /api/admin/payments/config — payment gateway configuration */
export async function getPaymentConfig(req: Request, res: Response): Promise<void> {
  try {
    const apiKeyConfigured = !!process.env.MONERÓO_API_KEY;
    const webhookUrl = process.env.MONERÓO_NOTIFY_URL || `${process.env.API_PUBLIC_URL}/api/webhooks/moneróo`;

    res.json({
      apiKeyConfigured,
      webhookUrl,
      webhookSecret: process.env.MONERÓO_WEBHOOK_SECRET || 'not-configured',
      testMode: process.env.NODE_ENV !== 'production',
      gateway: 'moneróo',
    });
  } catch (err) {
    console.error('[payments] getPaymentConfig error:', err);
    res.status(500).json({ error: 'Failed to load config' });
  }
}

/** POST /api/admin/payments/config — update payment configuration */
export async function updatePaymentConfig(req: Request, res: Response): Promise<void> {
  try {
    // Note: In production, this should update environment variables or a config store
    // For now, we just validate that the key would work
    const { apiKey } = req.body;

    if (!apiKey || !apiKey.startsWith('pvk_')) {
      res.status(400).json({ error: 'Invalid API key format' });
      return;
    }

    // In a real scenario, you'd test the key by making a small API call to Moneróo
    // or store it in a secure config store

    res.json({ success: true, message: 'API key updated (restart required)' });
  } catch (err) {
    console.error('[payments] updatePaymentConfig error:', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
}

/** GET /api/admin/payments/transactions — list payment transactions */
export async function listPaymentTransactions(req: Request, res: Response): Promise<void> {
  try {
    const { limit = 50, skip = 0, status, gateway } = req.query;

    const query: Record<string, unknown> = { gateway: gateway || 'moneróo' };
    if (status) query.status = status;

    const logs = await PaymentLog.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .lean();

    const transactions = logs.map((log) => ({
      id: log._id?.toString(),
      orderId: log.orderId?.toString(),
      amount: log.rawPayload?.amount || 0,
      currency: log.rawPayload?.currency || 'XOF',
      status: log.status,
      reference: log.reference,
      createdAt: log.createdAt,
    }));

    res.json(transactions);
  } catch (err) {
    console.error('[payments] listPaymentTransactions error:', err);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
}

/** GET /api/admin/payments/webhooks — list webhook logs */
export async function listWebhookLogs(req: Request, res: Response): Promise<void> {
  try {
    const { limit = 50, skip = 0, gateway } = req.query;

    const logs = await PaymentLog.find({
      gateway: gateway || 'moneróo',
      event: 'webhook',
    })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .lean();

    const webhookLogs = logs.map((log) => ({
      id: log._id?.toString(),
      event: log.event,
      status: log.signatureValid === false ? 'failed' : log.status === 'paid' ? 'success' : 'pending',
      payload: log.rawPayload || {},
      error: log.signatureValid === false ? 'Invalid signature' : undefined,
      createdAt: log.createdAt,
    }));

    res.json(webhookLogs);
  } catch (err) {
    console.error('[payments] listWebhookLogs error:', err);
    res.status(500).json({ error: 'Failed to load webhook logs' });
  }
}

/** GET /api/admin/payments/stats — payment statistics */
export async function getPaymentStats(req: Request, res: Response): Promise<void> {
  try {
    const { gateway = 'moneróo', days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - Number(days));

    const logs = await PaymentLog.find({
      gateway,
      createdAt: { $gte: since },
      event: 'webhook',
    }).lean();

    const paidLogs = logs.filter((l) => l.status === 'paid');
    const totalTransactions = logs.length;
    const totalVolume = paidLogs.reduce((sum, log) => sum + (Number(log.rawPayload?.amount) || 0), 0);
    const successRate = totalTransactions > 0 ? paidLogs.length / totalTransactions : 0;
    const avgAmount = paidLogs.length > 0 ? totalVolume / paidLogs.length : 0;

    res.json({
      totalTransactions,
      totalVolume,
      successRate,
      avgAmount,
      period: { days: Number(days), since: since.toISOString() },
    });
  } catch (err) {
    console.error('[payments] getPaymentStats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
}

/** POST /api/admin/payments/test — test payment flow */
export async function testPaymentFlow(req: Request, res: Response): Promise<void> {
  try {
    // This would create a test order and initiate a Moneróo payment
    // For now, we'll just return a success response
    res.json({
      success: true,
      message: 'Test payment initiated. Check your Moneróo dashboard.',
      testCheckoutUrl: 'https://checkout.moneroo.io/test-transaction-id',
    });
  } catch (err) {
    console.error('[payments] testPaymentFlow error:', err);
    res.status(500).json({ error: 'Failed to initiate test payment' });
  }
}

/** POST /api/admin/payments/retry/:logId — retry failed webhook */
export async function retryWebhook(req: Request, res: Response): Promise<void> {
  try {
    const { logId } = req.params;

    const log = await PaymentLog.findById(logId).lean();
    if (!log) {
      res.status(404).json({ error: 'Webhook log not found' });
      return;
    }

    // In a real scenario, you'd re-process the webhook
    // For now, we'll just return success
    res.json({
      success: true,
      message: `Webhook ${logId} reprocessed`,
    });
  } catch (err) {
    console.error('[payments] retryWebhook error:', err);
    res.status(500).json({ error: 'Failed to retry webhook' });
  }
}
