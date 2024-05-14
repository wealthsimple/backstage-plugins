import { getVoidLogger } from '@backstage/backend-common';
import { CompoundEntityRef } from '@backstage/catalog-model';
import { ConfigReader } from '@backstage/config';
import { TechDocsMetadata } from '@backstage/plugin-techdocs-backend';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { TechDocsClient } from './TechDocsClient';

describe('TechDocsClient', () => {
  let techDocsClient: TechDocsClient;
  const server = setupServer();
  const discoveryApi = { getBaseUrl: jest.fn() };
  const baseUrl = 'http://localhost/api';

  const config = new ConfigReader({
    backend: {
      baseUrl: 'http://localhost',
      listen: { port: 7000 },
    },
    app: {
      baseUrl: 'http://localhost',
      listen: { port: 3000 },
    },
  });

  const entity: CompoundEntityRef = {
    kind: 'component',
    namespace: 'default',
    name: 'some-handbook',
  };

  beforeAll(() => server.listen());

  beforeEach(() => {
    discoveryApi.getBaseUrl.mockResolvedValue(baseUrl);
    techDocsClient = TechDocsClient.create({
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
    it('returns a new instance of techDocsClient', () => {
      expect(
        TechDocsClient.create({
          config,
          logger: getVoidLogger(),
          discoveryApi,
        }),
      ).toBeInstanceOf(TechDocsClient);
    });
  });

  describe('getEntityUri', () => {
    it('returns the entity URI', () => {
      expect(techDocsClient.getEntityUri(entity)).toEqual(
        'default/component/some-handbook',
      );
    });
  });

  describe('getViewUrl', () => {
    it('returns docs view URL', () => {
      expect(techDocsClient.getViewUrl(entity, 'foo/index.html')).toEqual(
        'http://localhost/docs/default/component/some-handbook/foo',
      );
      expect(techDocsClient.getViewUrl(entity, 'foo/bar/index.html')).toEqual(
        'http://localhost/docs/default/component/some-handbook/foo/bar',
      );
      expect(techDocsClient.getViewUrl(entity, 'foo/baz.html')).toEqual(
        'http://localhost/docs/default/component/some-handbook/foo/baz',
      );
    });
  });

  describe('getTechDocsMetadata', () => {
    describe('success', () => {
      const mockTechDocsMetadata: TechDocsMetadata = {
        site_name: 'some-handbook',
        site_description: 'A Handbook for All',
        build_timestamp: 1650391420971,
        files: ['index.html'],
        etag: '6b054808e307181fcac94061ed77a9397f506071',
      };

      beforeEach(() => {
        server.use(
          rest.get(
            `${baseUrl}/default/component/some-handbook`,
            (_req, res, ctx) => {
              return res(ctx.status(200), ctx.json(mockTechDocsMetadata));
            },
          ),
        );
      });

      it('returns expected techdocs metadata', async () => {
        await expect(
          techDocsClient.getTechDocsMetadata(entity),
        ).resolves.toEqual(mockTechDocsMetadata);
      });
    });

    describe('error case', () => {
      beforeEach(() => {
        server.use(
          rest.get(
            `${baseUrl}/default/component/some-handbook`,
            (_req, res, ctx) => {
              return res(
                ctx.status(404),
                ctx.json({ errorMessage: 'Not Found' }),
              );
            },
          ),
        );
      });

      it('throws an error', async () => {
        await expect(
          techDocsClient.getTechDocsMetadata(entity),
        ).rejects.toThrow('Not Found');
      });
    });
  });

  describe('getTechDocsStaticFile', () => {
    const filePath = 'foo/index.html';

    describe('success', () => {
      const mockTechDocsStaticFile = 'I am a static file';

      beforeEach(() => {
        server.use(
          rest.get(
            `${baseUrl}/default/component/some-handbook/${filePath}`,
            (_req, res, ctx) => {
              return res(ctx.status(200), ctx.text(mockTechDocsStaticFile));
            },
          ),
        );
      });

      it('returns expected techdocs metadata', async () => {
        await expect(
          techDocsClient.getTechDocsStaticFile(entity, filePath),
        ).resolves.toEqual(mockTechDocsStaticFile);
      });
    });

    describe('error case', () => {
      beforeEach(() => {
        server.use(
          rest.get(
            `${baseUrl}/default/component/some-handbook/${filePath}`,
            (_req, res, ctx) => {
              return res(
                ctx.status(404),
                ctx.json({ errorMessage: 'Not Found' }),
              );
            },
          ),
        );
      });

      it('throws an error', async () => {
        await expect(
          techDocsClient.getTechDocsStaticFile(entity, filePath),
        ).rejects.toThrow('Not Found');
      });
    });
  });

  describe('parseUpdatedAt', () => {
    it('returns the parsed date', () => {
      const mockRawHtml = `
        <html>
          <article>
            <h1 id="title">This is the title<a class="headerlink" href="#title" title="Permanent link"></a></h1>
            <p>I am a file</p>
            <span class="git-revision-date-localized-plugin git-revision-date-localized-plugin-date">April 6, 2022</span>
          </article>
        </html>`;

      expect(techDocsClient.parseUpdatedAt(mockRawHtml)).toEqual(
        new Date('April 6, 2022'),
      );
    });
  });

  describe('parseTitle', () => {
    it('returns the text content of h1 as a title', () => {
      const mockRawHtml = `
        <html>
          <article>
            <h1 id="title">This is the title<a class="headerlink" href="#title" title="Permanent link"></a></h1>
            <p>I am a file</p>
            <span class="git-revision-date-localized-plugin git-revision-date-localized-plugin-date">April 6, 2022</span>
          </article>
        </html>`;

      expect(techDocsClient.parseTitle(mockRawHtml)).toEqual(
        'This is the title',
      );
    });

    describe('when there is no heading', () => {
      it('returns undefined', () => {
        const mockRawHtml = `
          <html>
            <article>
              <p>I am a file</p>
            </article>
          </html>`;

        expect(techDocsClient.parseTitle(mockRawHtml)).toEqual(undefined);
      });
    });
  });
});
