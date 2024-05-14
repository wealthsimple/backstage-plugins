import { CompoundEntityRef } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import { DiscoveryApi } from '@backstage/core-plugin-api';
import { startCase } from 'lodash';
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from 'winston';
import { TechDocsClient } from './TechDocsClient';
import { GleanDocument } from './types';

export class GleanIndexingService {
  private datasource = 'backstage';
  private techDocsClient: TechDocsClient;

  static create({
    config,
    discoveryApi,
    logger,
  }: {
    config: Config;
    discoveryApi: DiscoveryApi;
    logger: Logger;
  }) {
    return new GleanIndexingService(config, logger, discoveryApi);
  }

  constructor(
    private readonly config: Config,
    private logger: Logger,
    discoveryApi: DiscoveryApi,
  ) {
    this.techDocsClient = TechDocsClient.create({
      config,
      discoveryApi,
      logger,
    });
  }

  private generateUploadId(): string {
    return `upload-${uuidv4()}`;
  }

  private parseMainContent(rawHtml: string): string {
    const root = parse(rawHtml);
    root.querySelectorAll('nav').forEach(nav => nav.remove());
    return root.toString();
  }

  async buildDocument(
    entity: CompoundEntityRef,
    filePath: string,
  ): Promise<GleanDocument> {
    const rawHtml = await this.techDocsClient.getTechDocsStaticFile(
      entity,
      filePath,
    );

    const textContent = this.parseMainContent(rawHtml);
    const title =
      this.techDocsClient.parseTitle(rawHtml) ?? startCase(filePath);
    const updatedAtDate = this.techDocsClient.parseUpdatedAt(rawHtml);
    const updatedAt = Math.floor(updatedAtDate.getTime() / 1000); // in epoch seconds

    const partialDocument = {
      container: entity.name,
      datasource: this.datasource,
      id: `${entity.name}/${filePath}`,
      // these permissions allow anyone who can sign in to our Glean instance (via Okta SSO) to view the document
      permissions: { allowAnonymousAccess: true },
      title,
      updatedAt,
      viewURL: this.techDocsClient.getViewUrl(entity, filePath),
    };

    this.logger.debug(`Building document: ${JSON.stringify(partialDocument)}`);

    return {
      ...partialDocument,
      body: {
        mimeType: 'HTML',
        textContent,
      },
    };
  }

  private async buildDocuments(
    entity: CompoundEntityRef,
    filesToBuild: Array<string>,
  ) {
    return Promise.all(
      filesToBuild.map((filePath: string) =>
        this.buildDocument(entity, filePath),
      ),
    );
  }

  async bulkIndexBatch(
    documents: GleanDocument[],
    isFirstPage: boolean,
    isLastPage: boolean,
    uploadId: string,
  ) {
    const gleanUrl = `${this.config.getString(
      'glean.apiBaseUrl',
    )}/bulkindexdocuments`;
    const gleanToken = this.config.getString('glean.token');

    const response = await fetch(gleanUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gleanToken}`,
      },
      body: JSON.stringify({
        datasource: this.datasource,
        documents,
        isFirstPage,
        isLastPage,
        forceRestartUpload: isFirstPage,
        uploadId,
      }),
    });

    if (!response.ok) {
      this.logger.error(`Error bulk indexing: ${uploadId}`);
      throw new Error(response.statusText);
    }
  }

  // NOTE: This was previously used for indexing the engineering handbook, but is no longer in use
  //       It could re-purposed to index other Backstage things though.
  async bulkIndexTechDocs() {
    const uploadId = this.generateUploadId();
    this.logger.info(`Bulk indexing uploadId: ${uploadId}`);

    // TODO: get all Tech Docs entities via getTechDocsEntities()
    // bulk index each entity with Glean
    const engHandbook: CompoundEntityRef = {
      name: 'some-handbook',
      namespace: 'default',
      kind: 'component',
    };

    const metatdata = await this.techDocsClient.getTechDocsMetadata(
      engHandbook,
    );

    if (!metatdata.files) {
      this.logger.warn('No files to index');
      return;
    }

    let batchCount = 0;
    const batchSize = 25;
    const filesToIndex = metatdata.files.filter((filePath: string) =>
      filePath.endsWith('.html'),
    );

    for (
      let index = 0;
      index < filesToIndex.length;
      index = index + batchSize
    ) {
      this.logger.info(`Bulk indexing batch: ${batchCount}`);

      const isFirstPage = index < batchSize;
      const isLastPage = index >= filesToIndex.length - batchSize;
      const filesToBuild = filesToIndex.slice(index, index + batchSize);
      const documents = await this.buildDocuments(engHandbook, filesToBuild);

      await this.bulkIndexBatch(documents, isFirstPage, isLastPage, uploadId);
      batchCount++;
    }
    this.logger.info(
      `Successfully bulk indexed "${uploadId}" in ${batchCount} batches`,
    );
  }

  async bulkIndex() {
    // extend this method as there are more types of entities to index
    return await this.bulkIndexTechDocs();
  }
}
