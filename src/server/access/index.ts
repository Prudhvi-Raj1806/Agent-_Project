import { createRemoteAccess, realRemoteAccessDeps, type RemoteAccess } from "./remote-access";

let instance: RemoteAccess | null = null;

export function getRemoteAccess(): RemoteAccess {
  instance ??= createRemoteAccess(realRemoteAccessDeps);
  return instance;
}

/** Test-only: swap in an instance built from fake Tailscale and network checks. */
export function setRemoteAccessForTests(next: RemoteAccess): void {
  instance = next;
}

export function resetRemoteAccessForTests(): void {
  instance = null;
}
