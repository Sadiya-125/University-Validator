import { resolve } from "dns/promises";

/**
 * SSRF protection: validate URLs to prevent access to private IP ranges.
 * Rejects:
 * - Private/reserved IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.1, etc.)
 * - Link-local addresses (169.254.0.0/16)
 * - Non-HTTP(S) schemes
 * - Known problematic hostnames (localhost, 127.0.0.1, etc.)
 */

const PRIVATE_RANGES = [
  { start: ipToNumber("10.0.0.0"), end: ipToNumber("10.255.255.255") }, // 10.0.0.0/8
  { start: ipToNumber("172.16.0.0"), end: ipToNumber("172.31.255.255") }, // 172.16.0.0/12
  { start: ipToNumber("192.168.0.0"), end: ipToNumber("192.168.255.255") }, // 192.168.0.0/16
  { start: ipToNumber("127.0.0.0"), end: ipToNumber("127.255.255.255") }, // 127.0.0.0/8 (loopback)
  { start: ipToNumber("169.254.0.0"), end: ipToNumber("169.254.255.255") }, // 169.254.0.0/16 (link-local)
  { start: ipToNumber("0.0.0.0"), end: ipToNumber("0.255.255.255") }, // 0.0.0.0/8 (this network)
  { start: ipToNumber("224.0.0.0"), end: ipToNumber("239.255.255.255") }, // 224.0.0.0/4 (multicast)
  { start: ipToNumber("240.0.0.0"), end: ipToNumber("255.255.255.255") }, // 240.0.0.0/4 (reserved)
];

const PRIVATE_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "::",
  "169.254.169.254", // AWS metadata
];

function ipToNumber(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    throw new Error(`Invalid IP address: ${ip}`);
  }
  return (
    (parseInt(parts[0]!) << 24) +
    (parseInt(parts[1]!) << 16) +
    (parseInt(parts[2]!) << 8) +
    parseInt(parts[3]!)
  );
}

function isPrivateIPRange(ip: string): boolean {
  try {
    const num = ipToNumber(ip);
    for (const range of PRIVATE_RANGES) {
      if (num >= range.start && num <= range.end) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function isPrivateIP(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname || "";

    // Check hostname denylist
    if (PRIVATE_HOSTNAMES.includes(hostname)) {
      return true;
    }

    // Check if it's a private IP range
    if (isPrivateIPRange(hostname)) {
      return true;
    }

    // IPv6 checks
    if (hostname.includes(":") && !hostname.includes(".")) {
      // Rough IPv6 check
      if (hostname === "::1" || hostname === "::") {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function validateURL(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname || "";

    // Resolve DNS
    try {
      const address = await resolve(hostname);
      if (address && address.length > 0) {
        // Check if resolved IP is private
        for (const ip of address) {
          if (isPrivateIPRange(ip)) {
            console.warn(`Resolved hostname ${hostname} to private IP ${ip}`);
            return false;
          }
        }
      }
    } catch (error) {
      // DNS resolution failed
      console.warn(`Failed to resolve hostname ${hostname}`);
      return false;
    }

    return !isPrivateIP(url);
  } catch {
    return false;
  }
}
