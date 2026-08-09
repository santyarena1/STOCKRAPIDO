import { ProxyAgent, fetch as undiciFetch } from 'undici';

let proxyAgent: ProxyAgent | null = null;
let configuredProxyUrl: string | null = null;

export function hasArgentinaProxy() {
  return !!process.env.PROXY_URL_AR?.trim();
}

export async function proxiedFetch(url: string, options: Record<string, any> = {}): Promise<Response> {
  const proxyUrl = process.env.PROXY_URL_AR?.trim();
  if (!proxyUrl) return fetch(url, options as RequestInit);
  if (!proxyAgent || configuredProxyUrl !== proxyUrl) {
    proxyAgent = new ProxyAgent(proxyUrl);
    configuredProxyUrl = proxyUrl;
  }
  return undiciFetch(url, { ...options, dispatcher: proxyAgent }) as unknown as Response;
}
