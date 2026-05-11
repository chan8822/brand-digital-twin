const RAW = import.meta.env.VITE_API_BASE as string | undefined;

export const API_BASE: string = RAW
  ? RAW.replace(/\/+$/, "")
  : `${import.meta.env.BASE_URL.replace(/\/+$/, "")}/api`;

export function apiPath(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
