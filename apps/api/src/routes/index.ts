import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authRoutes } from '../modules/auth/auth.routes';
import { estimateRoutes } from '../modules/estimates/estimate.routes';
import { moduleRoutes } from '../modules/module-master/module.routes';
import { settingsRoutes } from '../modules/settings/settings.routes';
import { termsRoutes } from '../modules/terms/terms.routes';

export const apiRoutes = Router();

apiRoutes.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() }, message: 'Healthy' });
});

apiRoutes.use('/auth', authRoutes);

// Everything past this line requires a valid session.
apiRoutes.use(authenticate);
apiRoutes.use('/modules', moduleRoutes);
apiRoutes.use('/terms', termsRoutes);
apiRoutes.use('/settings', settingsRoutes);
apiRoutes.use('/estimates', estimateRoutes);
