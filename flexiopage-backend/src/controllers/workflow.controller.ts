import { Response } from 'express';
import validator from 'validator';
import { AuthRequest } from '../middleware/auth.middleware';
import * as workflowService from '../services/workflow.service';

/** Le middleware de nettoyage échappe les slashs. On les rend avant d'enregistrer le texte. */
function clean(value: unknown): string | undefined {
  return typeof value === 'string' ? validator.unescape(value) : undefined;
}

export async function getWorkflow(req: AuthRequest, res: Response): Promise<void> {
  const storeId = req.store!._id.toString();
  const workflow = await workflowService.getWorkflow(storeId);
  if (!workflow) {
    res.status(404).json({ error: 'Boutique introuvable.' });
    return;
  }
  const runs = await workflowService.listWorkflowRuns(storeId);
  res.json({ workflow, runs });
}

export async function saveWorkflow(req: AuthRequest, res: Response): Promise<void> {
  const storeId = req.store!._id.toString();
  const body = req.body as workflowService.AbandonedCheckoutInput;
  const result = await workflowService.saveWorkflow(storeId, {
    enabled: !!body.enabled,
    firstDelayMinutes: body.firstDelayMinutes,
    secondEnabled: body.secondEnabled,
    secondDelayHours: body.secondDelayHours,
    subject: clean(body.subject),
    body: clean(body.body),
  });
  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ workflow: result });
}
