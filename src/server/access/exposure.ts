import os from "node:os";
import { tcpOpen } from "@/server/services/process";

function networkAddresses(): string[] {
  const out: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) out.push(entry.address);
    }
  }
  return out;
}

/**
 * Is this server reachable on a network address (not just loopback)? If so,
 * anything on that network could reach it directly, which the owner should fix
 * by starting it with the loopback-bound `npm run dev` / `npm start`.
 */
export async function checkLanExposure(
  port: number,
  probe: (address: string, port: number) => Promise<boolean> = (address, p) => tcpOpen(address, p, 1_500),
  addresses: () => string[] = networkAddresses,
): Promise<{ exposed: boolean; address: string | null }> {
  const [address] = addresses();
  if (!address) return { exposed: false, address: null };
  try {
    return { exposed: await probe(address, port), address };
  } catch {
    return { exposed: false, address };
  }
}
