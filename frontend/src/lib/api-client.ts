export const API_BASE_URL = '/api/backend';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

function buildUrl(path: string, query?: Record<string, string | number | undefined | null>) {
  const normalizedBase = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const urlPath = `${normalizedBase}${normalizedPath}`;
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const url = new URL(urlPath, baseOrigin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function requestJson<T>(input: string, init: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    console.error(`API network error for ${input}: ${message}`);
    throw new Error(`Network error calling ${input}: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} for ${input}`);
  }

  const payload = (await response.json()) as ApiEnvelope<T> | T;
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    const envelope = payload as ApiEnvelope<T>;
    if (!envelope.success) {
      throw new Error(`API returned unsuccessful response for ${input}.`);
    }
    return envelope.data;
  }

  return payload as T;
}

export async function fetchApi<T>(path: string, query?: Record<string, string | number | undefined | null>): Promise<T> {
  const input = buildUrl(path, query);
  return requestJson<T>(input, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
}

export async function postApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const input = buildUrl(path);
  return requestJson<T>(input, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

export function formatTokenAmount(amount: number | string | null | undefined, decimals: number = 9, symbol: string = 'SUI') {
  if (amount === null || amount === undefined) return `0 ${symbol}`;
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(numeric)) return `${amount} ${symbol}`;
  
  // If the number is very large, it's likely raw units (Mist)
  // We assume if it's > 10^12 and we have decimals, it needs division
  // But better to just trust the source. If we are passed a human amount, decimals should be 0 or null.
  
  return `${numeric.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`;
}

export function formatSui(value: string | number | null | undefined, isRaw: boolean = true) {
  if (value === null || value === undefined) return '0 SUI';
  let numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) return `${value} SUI`;
  
  if (isRaw && Math.abs(numeric) > 1000000) {
    numeric = numeric / 1000000000;
  }
  
  return `${numeric.toLocaleString(undefined, { maximumFractionDigits: 4 })} SUI`;
}
