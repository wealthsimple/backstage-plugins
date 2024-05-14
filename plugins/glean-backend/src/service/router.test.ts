import { getVoidLogger, HostDiscovery } from '@backstage/backend-common';
import { ConfigReader } from '@backstage/config';
import express from 'express';
import request from 'supertest';
import { GleanIndexingService } from './GleanIndexingService';
import { createRouter } from './router';

describe('createRouter', () => {
  let app: express.Express;

  const mockGleanIndexingService = {
    bulkIndex: jest.fn(),
  };

  const config = new ConfigReader({
    backend: {
      baseUrl: 'http://127.0.0.1',
      listen: { port: 7000 },
    },
  });

  beforeAll(async () => {
    jest
      .spyOn(GleanIndexingService, 'create')
      .mockReturnValue(
        mockGleanIndexingService as unknown as GleanIndexingService,
      );
    const router = await createRouter({
      config,
      discovery: HostDiscovery.fromConfig(config),
      logger: getVoidLogger(),
    });
    app = express().use(router);
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('POST /bulk-index', () => {
    it('returns ok', async () => {
      const response = await request(app).post('/bulk-index');
      expect(mockGleanIndexingService.bulkIndex).toHaveBeenCalledTimes(1);
      expect(response.status).toEqual(200);
    });
  });
});
