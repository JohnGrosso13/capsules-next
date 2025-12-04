export type RateLimitWindow = `${number} ${"s" | "m" | "h" | "d"}`;

export type RateLimitDefinition = {
  name: string;
  limit: number;
  window: RateLimitWindow;
  analytics?: boolean;
  prefix?: string;
};

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  limit: number;
  reset: number | null;
};

export interface RateLimitAdapter {
  vendor: string;
  limit(definition: RateLimitDefinition, identifier: string): Promise<RateLimitResult | null>;
}
