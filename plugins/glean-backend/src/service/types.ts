export type GleanDocument = {
  id: string;
  title: string;
  container: string;
  datasource: string;
  viewURL: string;
  body: {
    mimeType: string;
    textContent: string;
  };
  updatedAt: number; // in epoch seconds
  permissions: { allowAnonymousAccess: boolean };
};
