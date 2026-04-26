// ============================================================================
// url-security.ts - Protection anti-SSRF (Patch HX-01)
//
// Genere par patch-hx01.ps1 le 2026-04-26 21:33:02
// Voir docs/security/patches/HX-01-ssrf-import-video.patch.md pour le detail.
// ============================================================================
import dns from 'node:dns/promises';

/**
 * Verifie si une IP appartient a une plage privee/reservee/loopback.
 * Couvre IPv4 + IPv6 (loopback, link-local, ULA, IPv4-mapped, etc.)
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.some((p) => p > 255 || p < 0)) return true;

    const [a, b] = parts;
    if (a === 0) return true;                          // 0.0.0.0/8
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 127) return true;                        // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;           // 169.254.0.0/16 link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true;                         // multicast + reserved
    return false;
  }

  // IPv6
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');

  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true;

  // IPv4-mapped : ::ffff:X.X.X.X
  const v4mapMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapMatch) return isPrivateIp(v4mapMatch[1]);

  // IPv4-mapped hex : ::ffff:7f00:1
  const hexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch) {
    const a = parseInt(hexMatch[1], 16);
    const b = parseInt(hexMatch[2], 16);
    return isPrivateIp(`${(a >> 8) & 0xff}.${a & 0xff}.${(b >> 8) & 0xff}.${b & 0xff}`);
  }

  // 0:0:0:0:0:0:0:1 forme expanded
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
 * Valide qu'une URL est publique (protocole http/https + host non prive).
 * Ne resout PAS le DNS (voir resolvePublicUrl pour la version anti-rebinding).
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

  // Si c'est deja une IP, verifier directement
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) {
      throw new Error(`Host prive non autorise : ${host}`);
    }
  }

  // Domaines wildcard publics qui resolvent en local
  const SUSPICIOUS_DOMAINS = ['nip.io', 'sslip.io', 'localtest.me', 'lvh.me'];
  for (const sus of SUSPICIOUS_DOMAINS) {
    if (host.endsWith(`.${sus}`) || host === sus) {
      throw new Error(`Domaine suspect non autorise : ${host}`);
    }
  }

  return parsed;
}

/**
 * Variante anti-DNS-rebinding : resout le DNS et verifie chaque IP.
 * A utiliser avant les fetches sensibles.
 */
export async function resolvePublicUrl(rawUrl: string): Promise<{
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