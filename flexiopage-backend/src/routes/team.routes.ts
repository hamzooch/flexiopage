import { Router } from 'express';
import * as teamController from '../controllers/team.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { sanitizeMiddleware } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);
router.use(sanitizeMiddleware);

router.get('/', teamController.listTeam);
router.post('/', teamController.createTeamMember);
router.patch('/:memberId', teamController.updateTeamMember);
router.delete('/:memberId', teamController.removeTeamMember);

export default router;
