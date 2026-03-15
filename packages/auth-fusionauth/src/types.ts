export interface FusionAuthConfig {
  /** FusionAuth server base URL (e.g. https://your-tenant.fusionauth.io) */
  serverUrl: string;
  /** Application client ID used as JWT audience (aud) */
  clientId: string;
  /** Optional custom issuer; defaults to serverUrl */
  issuer?: string;
}
