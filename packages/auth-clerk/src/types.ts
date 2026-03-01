export interface ClerkConfig {
  /** Clerk secret key (sk_live_... or sk_test_...) */
  secretKey: string;
  /** Clerk publishable key (pk_live_... or pk_test_...) */
  publishableKey?: string;
  /** Allowed origins for session token verification */
  authorizedParties?: string[];
  /** PEM public key for local JWT verification without network calls */
  jwtKey?: string;
}
