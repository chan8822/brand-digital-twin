const RAW = import.meta.env.VITE_API_BASE as string | undefined;

// Fall back to the wellness-foods Cloud Run URL so that builds without
// VITE_API_BASE don't send API requests to the tanmatra SSR server itself
// (which has no /api routes and would return 200 HTML, causing JSON parse
// errors throughout the app).
export const API_BASE: string = RAW
  ? RAW.replace(/\/+$/, "")
  : "https://wellness-foods-1076775857511.asia-south2.run.app/api";

export function apiPath(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
