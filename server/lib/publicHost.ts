import dns from "dns/promises";
import net from "net";

/**
 * Guards every server-side fetch of a URL that came from a client.
 *
 * Two places need it: the image proxy, which forwards a browser's request, and
 * the cover cache, which takes a local copy of whatever URL a media entry
 * carries. Both turn a string from the outside into an outbound request from
 * inside the network the container sits on, so both have to refuse anything
 * that resolves somewhere the user could not reach themselves.
 */
export const BLOCKED_HOST = /^(localhost$|.*\.local$|.*\.internal$)/i;

/** Loopback, link-local, and the RFC1918 / unique-local ranges. */
export function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || a >= 224;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower === "::" || lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd") ||
      // v4-mapped, e.g. ::ffff:127.0.0.1
      (lower.startsWith("::ffff:") && isPrivateAddress(lower.slice(7)));
  }
  return true; // unparseable is not something to connect to
}

/**
 * Rejects a host that resolves anywhere on the local network.
 *
 * Checking the hostname string alone would miss the obvious move of pointing a
 * public name at 127.0.0.1, so the name is resolved first. A name that changes
 * its answer between this check and the fetch could still slip through; that
 * needs connection-level pinning, which is more machinery than a single-user
 * self-hosted app warrants.
 */
export async function resolvesPrivately(hostname: string): Promise<boolean> {
  const literal = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(literal)) return isPrivateAddress(literal);
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    return addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address));
  } catch {
    return true;
  }
}


/** Whether a hostname is safe to fetch server-side on a client's behalf. */
export async function isPublicHost(hostname: string): Promise<boolean> {
  if (BLOCKED_HOST.test(hostname)) return false;
  return !(await resolvesPrivately(hostname));
}
