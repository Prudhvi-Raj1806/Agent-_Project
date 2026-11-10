import { createServiceController, type ServiceController } from "./controller";
import { getServiceDefs } from "./registry";

let controller: ServiceController | null = null;

export function getServiceController(): ServiceController {
  controller ??= createServiceController(getServiceDefs());
  return controller;
}

/** Test-only: swap in a controller built from fake services. */
export function setServiceControllerForTests(next: ServiceController): void {
  controller = next;
}

export function resetServiceControllerForTests(): void {
  controller = null;
}
