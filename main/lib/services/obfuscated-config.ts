function decodeXorPayload(payload: number[], key: number): string {
  const decodedBytes = payload.map((value) => value ^ key);
  return Buffer.from(decodedBytes).toString('utf8');
}

const XOR_KEY = 73;

const BACKEND_BASE_URL_PAYLOAD = [
  33, 61, 61, 57, 58, 115, 102, 102, 60, 59, 40, 32, 47, 60, 37, 37, 103, 63, 44, 59, 42, 44,
  37, 103, 40, 57, 57, 102,
];

const SUPABASE_URL_PAYLOAD = [
  33, 61, 61, 57, 58, 115, 102, 102, 47, 57, 59, 57, 51, 35, 37, 49, 56, 36, 37, 36, 63, 59, 33,
  49, 36, 34, 58, 58, 103, 58, 60, 57, 40, 43, 40, 58, 44, 103, 42, 38,
];

const SUPABASE_ANON_KEY_PAYLOAD = [
  44, 48, 3, 33, 43, 14, 42, 32, 6, 32, 3, 0, 28, 51, 0, 120, 7, 32, 0, 58, 0, 39, 27, 124, 42,
  10, 0, 127, 0, 34, 57, 17, 31, 10, 3, 112, 103, 44, 48, 3, 57, 42, 122, 4, 32, 6, 32, 3, 51,
  45, 17, 11, 33, 16, 36, 15, 51, 19, 26, 0, 58, 0, 39, 3, 37, 19, 32, 0, 127, 0, 36, 19, 62,
  42, 39, 11, 127, 40, 36, 49, 125, 42, 30, 120, 58, 43, 17, 19, 48, 40, 1, 33, 61, 40, 122, 7,
  51, 0, 32, 62, 32, 42, 36, 112, 58, 19, 26, 0, 127, 0, 36, 15, 60, 43, 123, 125, 32, 5, 10, 3,
  57, 16, 17, 24, 32, 6, 35, 12, 122, 7, 51, 24, 121, 7, 13, 34, 49, 7, 13, 34, 58, 0, 36, 31,
  125, 42, 10, 0, 127, 4, 35, 8, 124, 4, 13, 8, 48, 7, 29, 12, 121, 6, 17, 121, 103, 100, 58,
  39, 19, 122, 58, 61, 16, 17, 17, 63, 49, 58, 36, 38, 38, 3, 24, 32, 1, 44, 28, 124, 56, 34,
  57, 5, 6, 19, 122, 0, 15, 44, 47, 5, 57, 44, 37, 121, 48, 29, 5, 0,
];

export function getObfuscatedBackendBaseUrl(): string {
  return decodeXorPayload(BACKEND_BASE_URL_PAYLOAD, XOR_KEY);
}

export function getObfuscatedSupabaseUrl(): string {
  return decodeXorPayload(SUPABASE_URL_PAYLOAD, XOR_KEY);
}

export function getObfuscatedSupabaseAnonKey(): string {
  return decodeXorPayload(SUPABASE_ANON_KEY_PAYLOAD, XOR_KEY);
}
