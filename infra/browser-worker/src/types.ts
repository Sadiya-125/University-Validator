export interface RenderRequest {
  url: string;
  waitFor?: string; // CSS selector to wait for
  screenshot?: boolean;
  timeoutMs?: number;
}

export interface RenderTimings {
  navigationMs: number;
  renderMs: number;
  totalMs: number;
}

export interface RenderResponseSuccess {
  status: "ok";
  html: string;
  finalUrl: string;
  screenshotBase64?: string;
  timings: RenderTimings;
  consoleErrors: string[];
}

export interface RenderResponseError {
  status: "error";
  error: string;
  statusCode?: number;
}

export type RenderResponse = RenderResponseSuccess | RenderResponseError;

export interface HealthResponse {
  status: "ok";
  poolSize: number;
  busy: number;
  queued: number;
  rendersSinceRecycle: number;
  uptime: number;
  memoryMB: number;
}
