/** Device — backend device info + GPU config. */
import { IPC } from "../../shared/bridge";
import { apiGet, apiPost } from "../backend/client";
import { handle } from "../core/ipc";
import type { DeviceInfo } from "../../shared/types/device";

function fallbackDevice(): DeviceInfo {
  return {
    provider: "cpu",
    ep: "CPUExecutionProvider",
    providers: ["CPUExecutionProvider"],
    gpus: [],
    gpuName: null,
    onnxRuntime: null,
    accelerated: false,
  };
}

function isDeviceInfo(v: unknown): v is DeviceInfo {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as DeviceInfo).provider === "string" &&
    typeof (v as DeviceInfo).ep === "string"
  );
}

/** Normalize backend payload — treat any non-CPU EP as accelerated. */
function normalizeDevice(raw: DeviceInfo): DeviceInfo {
  const provider = (raw.provider || "cpu").toLowerCase();
  const gpuProviders = new Set(["cuda", "dml", "coreml"]);
  const accelerated =
    !!raw.accelerated || gpuProviders.has(provider);
  return { ...raw, provider, accelerated };
}

export function registerDeviceHandlers(): void {
  handle(IPC.device, async () => {
    try {
      const raw = await apiGet("/device");
      return isDeviceInfo(raw) ? normalizeDevice(raw) : fallbackDevice();
    } catch {
      return fallbackDevice();
    }
  });
  handle(IPC.deviceConfigure, async (_e, useGpu: boolean) => {
    try {
      const raw = await apiPost("/device/configure", { useGpu: !!useGpu });
      if (!isDeviceInfo(raw)) return fallbackDevice();
      return normalizeDevice(raw);
    } catch {
      return fallbackDevice();
    }
  });
  handle(IPC.checkModel, async () => {
    try {
      return await apiGet("/model/check");
    } catch {
      return { cached: false };
    }
  });
}
