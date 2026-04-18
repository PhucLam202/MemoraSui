export function maskWalletAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function buildSessionTitle(input: string) {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Wallet chat';
  }

  return normalized.slice(0, 60);
}

export function joinFacts(facts: string[]) {
  return facts
    .map((fact) => fact.trim())
    .filter(Boolean)
    .join(' ');
}
