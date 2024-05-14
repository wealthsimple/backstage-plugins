export interface Config {
  /**
   * Glean plugin configuration.
   */
  glean?: {
    /**
     * The base url of the Glean API
     */
    apiBaseUrl: string;

    /**
     * The api token
     * @visibility secret
     */
    token: string;
  };
}
