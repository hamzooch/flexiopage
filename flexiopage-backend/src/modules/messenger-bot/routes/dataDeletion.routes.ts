/**
 * Routes PUBLIQUES du Data Deletion Callback Meta (pas de JWT — Meta poste
 * directement). Montées sous /api/messenger-bot AVANT le routeur authentifié.
 */
import { Router } from 'express';
import { receiveDeletion, deletionStatus } from '../controllers/dataDeletion.controller';

export const dataDeletionRouter = Router();

dataDeletionRouter.post('/data-deletion', receiveDeletion);
dataDeletionRouter.get('/data-deletion/status/:code', deletionStatus);
