import express from 'express';
import { appMarketplaceRouter } from './app-marketplace';
import { healthRouter } from './health';

const openApiRouter = express.Router();

openApiRouter.use('/', healthRouter);
openApiRouter.use('/app-marketplace', appMarketplaceRouter);

export { openApiRouter };
