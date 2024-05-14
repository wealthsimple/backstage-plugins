import {
  errorHandler,
  PluginEndpointDiscovery,
} from '@backstage/backend-common';
import { Config } from '@backstage/config';
import express from 'express';
import Router from 'express-promise-router';
import { Logger } from 'winston';
import { GleanIndexingService } from './GleanIndexingService';

export interface RouterOptions {
  config: Config;
  discovery: PluginEndpointDiscovery;
  logger: Logger;
}

export async function createRouter({
  config,
  discovery,
  logger: baseLogger,
}: RouterOptions): Promise<express.Router> {
  const logger = baseLogger.child({ plugin: 'glean' });
  const gleanIndexingService = GleanIndexingService.create({
    config,
    discoveryApi: discovery,
    logger,
  });

  logger.info('Glean backend starting up ...');

  const router = Router();
  router.use(express.json());

  /**
   * POST /bulk-index
   * @summary Bulk indexes content with Glean
   * @description This forces re-indexing of all content.
   * @response 200 - Success
   */
  router.post('/bulk-index', async (_, response) => {
    await gleanIndexingService.bulkIndex();
    return response.status(200).end();
  });
  router.use(errorHandler());
  return router;
}
