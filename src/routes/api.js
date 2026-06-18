/**
 * API Router — aggregates all sub-routers.
 */
import { Router } from 'express';
import authRoutes from './auth.js';
import skillRoutes from './skills.js';
import modelRoutes from './models.js';
import apiRoutes from './apis.js';
import knowledgeRoutes from './knowledge.js';
import apikeyRoutes from './apikeys.js';
import workflowRoutes from './workflows.js';
import aiRoutes from './ai.js';
import miscRoutes from './misc.js';
import { modelService } from '../services/modelService.js';
import { startScheduler, stopScheduler } from '../services/workflowService.js';
import { createLogger } from '../logger.js';

const log = createLogger('api');
const router = Router();

router.use(authRoutes);
router.use(skillRoutes);
router.use(modelRoutes);
router.use(apiRoutes);
router.use(knowledgeRoutes);
router.use(apikeyRoutes);
router.use(workflowRoutes);
router.use(aiRoutes);
router.use(miscRoutes);

export const startModelsCacheRefresh = modelService.startCacheRefresh.bind(modelService);
export const stopModelsCacheRefresh = modelService.stopCacheRefresh.bind(modelService);
export { startScheduler, stopScheduler } from '../services/workflowService.js';

export default router;
