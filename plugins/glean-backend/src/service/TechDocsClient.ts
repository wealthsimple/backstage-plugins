import { CompoundEntityRef } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import { DiscoveryApi } from '@backstage/core-plugin-api';
import { TechDocsMetadata } from '@backstage/plugin-techdocs-backend';
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import { Logger } from 'winston';

export class TechDocsClient {
  static create({
    config,
    discoveryApi,
    logger,
  }: {
    config: Config;
    discoveryApi: DiscoveryApi;
    logger: Logger;
  }) {
    return new TechDocsClient(config, discoveryApi, logger);
  }

  constructor(
    private readonly config: Config,
    private readonly discoveryApi: DiscoveryApi,
    private logger: Logger,
  ) {}

  async getTechDocsMetadataUrl(path: string = '') {
    return `${await this.discoveryApi.getBaseUrl(
      'techdocs/metadata/techdocs',
    )}/${path}`;
  }

  async getTechDocsStaticUrl(path: string = '') {
    return `${await this.discoveryApi.getBaseUrl(
      'techdocs/static/docs',
    )}/${path}`;
  }

  getEntityUri(entity: CompoundEntityRef) {
    return `${entity.namespace}/${entity.kind}/${entity.name}`.toLowerCase();
  }

  getViewUrl(entity: CompoundEntityRef, filePath: string) {
    const docsUrl = `${this.config.getString('app.baseUrl')}/docs`;
    const entityUrl = `${docsUrl}/${this.getEntityUri(entity)}`;
    return `${entityUrl}/${filePath.replace(/\/index\.html|\.html/, '')}`;
  }

  async getTechDocsEntities() {
    // TODO: use catalog API to find all tech docs

  }

  async getTechDocsMetadata(
    entity: CompoundEntityRef,
  ): Promise<TechDocsMetadata> {
    return await new Promise<TechDocsMetadata>(async (resolve, reject) => {
      try {
        const url = await this.getTechDocsMetadataUrl(
          this.getEntityUri(entity),
        );
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });
        if (!response.ok) {
          throw new Error(response.statusText);
        }
        resolve(response.json());
      } catch (err) {
        this.logger.error(err.message);
        reject(new Error(err.message));
      }
    });
  }

  async getTechDocsStaticFile(entity: CompoundEntityRef, filePath: string) {
    return await new Promise<string>(async (resolve, reject) => {
      try {
        const url = await this.getTechDocsStaticUrl(
          `${this.getEntityUri(entity)}/${filePath}`,
        );
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'text/plain',
          },
        });
        if (!response.ok) {
          throw new Error(response.statusText);
        }
        resolve(response.text());
      } catch (err) {
        this.logger.error(err.message);
        reject(new Error(err.message));
      }
    });
  }

  parseUpdatedAt(rawHtml: string): Date {
    const root = parse(rawHtml);
    const updatedAtDateString = root.querySelector(
      '.git-revision-date-localized-plugin.git-revision-date-localized-plugin-date',
    )?.rawText;
    return updatedAtDateString ? new Date(updatedAtDateString) : new Date();
  }

  parseTitle(rawHtml: string): string | undefined {
    const root = parse(rawHtml);
    const h1 = root.querySelector('h1');
    return h1?.rawText.replace('&para;', '');
  }
}
