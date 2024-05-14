import { getVoidLogger } from '@backstage/backend-common';
import { CompoundEntityRef } from '@backstage/catalog-model';
import { ConfigReader } from '@backstage/config';
import { TechDocsMetadata } from '@backstage/plugin-techdocs-backend';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { GleanIndexingService } from './GleanIndexingService';
import { htmlFixture } from './fixtures/staticTechDocsHtml';
import { GleanDocument } from './types';

describe('GleanIndexingService', () => {
  let gleanIndexingService: GleanIndexingService;
  const server = setupServer();
  const discoveryApi = { getBaseUrl: jest.fn() };
  const gleanBaseUrl = 'https://wealthsimple-be.glean.com/api/index/v1';

  const config = new ConfigReader({
    backend: {
      baseUrl: 'http://localhost',
      listen: { port: 7000 },
    },
    app: {
      baseUrl: 'http://localhost',
      listen: { port: 3000 },
    },
    glean: {
      apiBaseUrl: gleanBaseUrl,
      token: 'I-am-a-token',
    },
  });

  const entity: CompoundEntityRef = {
    kind: 'component',
    namespace: 'default',
    name: 'some-handbook',
  };

  beforeAll(() => server.listen());

  beforeEach(() => {
    gleanIndexingService = GleanIndexingService.create({
      config,
      discoveryApi,
      logger: getVoidLogger(),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  describe('create', () => {
    it('returns a new instance of GleanIndexingService', () => {
      expect(
        GleanIndexingService.create({
          config,
          logger: getVoidLogger(),
          discoveryApi,
        }),
      ).toBeInstanceOf(GleanIndexingService);
    });
  });

  describe('parseMainContent', () => {
    it('removes all nav elements from HTML', () => {
      expect(htmlFixture).toEqual(expect.stringContaining('<nav'));
      // eslint-disable-next-line dot-notation
      expect(gleanIndexingService['parseMainContent'](htmlFixture)).toEqual(
        expect.not.stringContaining('<nav'),
      );
    });
  });

  describe('buildDocument', () => {
    beforeEach(() => {
      // eslint-disable-next-line dot-notation
      gleanIndexingService['techDocsClient'].getTechDocsStaticFile = jest
        .fn()
        .mockResolvedValue(htmlFixture);
    });

    it('returns a document object', async () => {
      expect(
        await gleanIndexingService.buildDocument(entity, 'foo/index.html'),
      ).toEqual({
        id: 'some-handbook/foo/index.html',
        title: 'Engineering Handbook',
        container: 'some-handbook',
        datasource: 'backstage',
        viewURL: 'http://localhost/docs/default/component/some-handbook/foo',
        body: {
          mimeType: 'HTML',
          textContent: expect.stringContaining(
            "Welcome to Wealthsimple's Engineering Handbook!",
          ),
        },
        updatedAt: Math.floor(new Date('April 6, 2022').getTime() / 1000),
        permissions: { allowAnonymousAccess: true },
      });
    });
  });

  describe('bulkIndexTechDocs', () => {
    const mockDocument: GleanDocument = {
      id: 'document-1',
      title: 'I am a document',
      container: 'some-handbook',
      datasource: 'backstage',
      viewURL: 'http://backstage.w10e.com',
      body: {
        mimeType: 'HTML',
        textContent: 'I am some text content',
      },
      updatedAt: 1652818028,
      permissions: { allowAnonymousAccess: true },
    };

    const mockTechDocsMetadata: TechDocsMetadata = {
      site_name: 'some-handbook',
      site_description: 'Wealthsimple&#x27,s Engineering Handbook',
      etag: '38cf6ed97f8c501426a0e311b76d67c69fc46df3',
      build_timestamp: 1652796973948,
      files: ['index.html', 'interviewing/index.html', 'onboarding.html'],
    };

    beforeEach(() => {
      jest
        .spyOn(gleanIndexingService, 'buildDocument')
        .mockResolvedValue(mockDocument);

      jest.spyOn(gleanIndexingService, 'bulkIndexBatch');

      // eslint-disable-next-line dot-notation
      gleanIndexingService['techDocsClient'].getTechDocsMetadata = jest
        .fn()
        .mockResolvedValue(mockTechDocsMetadata);

      server.use(
        rest.post(`${gleanBaseUrl}/bulkindexdocuments`, (_req, res, ctx) => {
          return res(ctx.status(200));
        }),
      );
    });

    it('builds the Glean documents', async () => {
      await gleanIndexingService.bulkIndexTechDocs();
      expect(gleanIndexingService.buildDocument).toHaveBeenCalledTimes(3);
    });

    it('indexes the documents in batches', async () => {
      await gleanIndexingService.bulkIndexTechDocs();
      expect(gleanIndexingService.bulkIndexBatch).toHaveBeenCalledTimes(1);
      expect(gleanIndexingService.bulkIndexBatch).toHaveBeenCalledWith(
        [mockDocument, mockDocument, mockDocument], // three documents
        true, // isFirstPage
        true, // isLastPage
        expect.stringContaining('upload-'),
      );
    });

    describe('when there are no files to index', () => {
      beforeEach(() => {
        // eslint-disable-next-line dot-notation
        gleanIndexingService['techDocsClient'].getTechDocsMetadata = jest
          .fn()
          .mockResolvedValue({ ...mockTechDocsMetadata, files: [] });
      });

      it('does not index tech docs with Glean', async () => {
        await gleanIndexingService.bulkIndexTechDocs();
        expect(gleanIndexingService.buildDocument).not.toHaveBeenCalled();
        expect(gleanIndexingService.bulkIndexBatch).not.toHaveBeenCalled();
      });
    });
  });

  describe('bulkIndex', () => {
    beforeEach(() => {
      jest.spyOn(gleanIndexingService, 'bulkIndexTechDocs').mockResolvedValue();
    });

    it('indexes the TechDocs entities', async () => {
      await gleanIndexingService.bulkIndex();
      expect(gleanIndexingService.bulkIndexTechDocs).toHaveBeenCalledTimes(1);
    });
  });
});
