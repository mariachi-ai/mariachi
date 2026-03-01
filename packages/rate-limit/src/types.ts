export interface RateLimitConfig {
  adapter: string;
  url?: string;
}

export interface RateLimitRule {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
