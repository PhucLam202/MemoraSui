const ADDRESS_PATTERN = /0x[a-fA-F0-9]{8,}/g;
const TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9._-]+/gi;
const SIGNATURE_PATTERN = /([A-Za-z0-9+/]{40,}={0,2})/g;

export function maskWalletAddress(address: string | null | undefined) {
  if (!address) return 'n/a';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function redactSensitive(input: string | null | undefined) {
  if (!input) return '';
  return input
    .replace(ADDRESS_PATTERN, (value) => maskWalletAddress(value))
    .replace(TOKEN_PATTERN, 'Bearer [redacted-token]')
    .replace(SIGNATURE_PATTERN, '[redacted-signature]');
}
