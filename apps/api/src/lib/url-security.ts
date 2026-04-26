// ============================================================================
// url-security.ts - Protection anti-SSRF (Patches HX-01 + HX-02 + HX-04)
// ============================================================================
import dns from 'node:dns/promises';

/**
 * Verifie si une IP appartient a une plage privee/reservee/loopback.
 * Couvre IPv4 + IPv6 (loopback, link-local, ULA, IPv4-mapped, IPv4-mapped hex,
 * forme expanded, etc.)
 */
export function isPrivateIp(ip: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.some((p) => p > 255 || p < 0)) return true;

    const [a, b] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');

  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true;

  const v4mapMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapMatch) return isPrivateIp(v4mapMatch[1]);

  const hexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch) {
    const a = parseInt(hexMatch[1], 16);
    const b = parseInt(hexMatch[2], 16);
    return isPrivateIp(`${(a >> 8) & 0xff}.${a & 0xff}.${(b >> 8) & 0xff}.${b & 0xff}`);
  }

  const expanded = lower.split(':');
  if (
    expanded.length === 8 &&
    expanded.slice(0, 7).every((p) => p === '0' || p === '0000') &&
    (expanded[7] === '1' || expanded[7] === '0001')
  ) {
    return true;
  }

  return false;
}

/**
 * Validation synchrone de l'URL (sans DNS lookup).
 * - Verifie protocole (http/https)
 * - Verifie hostname (pas de localhost, IPs privees, domaines wildcard suspects)
 */
export function assertPublicUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL invalide');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Protocole non autorise (http/https uniquement)');
  }

  const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');

  const FORBIDDEN_HOSTNAMES = ['localhost', 'ip6-localhost', 'ip6-loopback', 'broadcasthost'];
  if (FORBIDDEN_HOSTNAMES.includes(host)) {
    throw new Error(`Host prive non autorise : ${host}`);
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) {
      throw new Error(`Host prive non autorise : ${host}`);
    }
  }

  const SUSPICIOUS_DOMAINS = ['nip.io', 'sslip.io', 'localtest.me', 'lvh.me'];
  for (const sus of SUSPICIOUS_DOMAINS) {
    if (host.endsWith(`.${sus}`) || host === sus) {
      throw new Error(`Domaine suspect non autorise : ${host}`);
    }
  }

  return parsed;
}

/**
 * Validation asynchrone : valide la syntaxe + resout le DNS et verifie chaque IP.
 * A utiliser pour les fetches sensibles (anti-DNS-rebinding).
 *
 * Retourne l'URL parsee et l'IP resolue (a passer a l'agent HTTP via lookup()).
 */
export async function assertPublicUrlAsync(rawUrl: string): Promise<{
  url: URL;
  resolvedIp: string;
  family: 4 | 6;
}> {
  const parsed = assertPublicUrl(rawUrl);
  const host = parsed.hostname.replace(/\.+$/, '');

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return { url: parsed, resolvedIp: host, family: 4 };
  }
  if (host.includes(':')) {
    return { url: parsed, resolvedIp: host, family: 6 };
  }

  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error(`Aucune IP resolue pour ${host}`);
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr.address)) {
      throw new Error(
        `Host prive detecte apres resolution DNS : ${host} -> ${addr.address}`,
      );
    }
  }

  return {
    url: parsed,
    resolvedIp: addresses[0].address,
    family: addresses[0].family as 4 | 6,
  };
}