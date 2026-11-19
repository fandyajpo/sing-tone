export interface SnapshotInput {
  method: string;
  origin: string;
  requestUrl: string;
  contentType: string;
  consent: string;
  clientKey: string;
  bytes: Uint8Array;
  webhookUrl: string | undefined;
  now: number;
}

export interface SnapshotResult {
  status: string;
  code: number;
  body: { ok: boolean; status: string; message: string };
  headers?: Record<string, string>;
}

export const MAX_SNAPSHOT_BYTES: number;

export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | null;
export function isAllowedWebhook(url: string): boolean;
export function checkRateLimit(
  clientKey: string,
  now: number,
): { allowed: boolean; retryAfterMs: number };
export function forwardSnapshot(
  webhookUrl: string,
  bytes: Uint8Array,
  mime: string,
  now: number,
): Promise<boolean>;
export function handleSnapshot(input: SnapshotInput): Promise<SnapshotResult>;
