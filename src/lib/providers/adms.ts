/**
 * ADMS (Administrador de Dispositivos / Device Management System) provider.
 *
 * The new rig runs an ADMS instance that publishes:
 *  - device inventory (name, type, host, port, sync interval, checksum)
 *  - device config endpoint used by this service to keep the DB in sync
 *
 * Endpoints (configured per ADMS host):
 *  GET  /api/adms/config       -> { admsHost, admsPort, admsProtocol, timeoutMs, active }
 *  GET  /api/adms/devices      -> { devices: [{ name, type, host?, port?, intervalSec?, checksum? }] }
 *  POST /api/adms/events       -> { employeeCode, eventType, datetime, deviceName, ... }
 *
 * Types:
 *  biometric  -> rig-mounted biometric clock (marks directly to Workera)
 *  mobile     -> Android / iOS app on a hand-held device (GPS depends on location)
 *  web        -> "Portal del Trabajador" (web app, GPS depends on location)
 *  sistema    -> admin-marked attendance (like new rig clocks)
 */

import { z } from "zod";

export const admsDeviceTypeSchema = z.enum(["biometric", "mobile", "web", "sistema"]);

export interface AdmsDeviceRaw {
  name: string;
  type: "biometric" | "mobile" | "web" | "sistema";
  /** ADMS API host that this device speaks to (blank = same ADMS host as config) */
  host?: string;
  /** ADMS port that this device speaks to (blank = use config port) */
  port?: number;
  /** Sync interval in seconds (blank = service default) */
  intervalSec?: number;
  /** SHA-256 checksum of the device config */
  checksum?: string;
}

export interface AdmsDevicesResponse {
  devices: AdmsDeviceRaw[];
}

export const admsDevicesResponseSchema = z.object({
  devices: z.array(
    z.object({
      name: z.string(),
      type: admsDeviceTypeSchema,
      host: z.string().optional(),
      port: z.number().int().positive().optional(),
      intervalSec: z.number().int().positive().optional(),
      checksum: z.string().optional(),
    }),
  ),
});

export interface AdmsConfig {
  admsHost: string;
  admsPort: number;
  admsProtocol: "http" | "https";
  timeoutMs: number;
  active: boolean;
}

/** Local ADMS endpoint base URL, e.g. "http://adms.intra:8080" */
export const ADMS_CONFIG_URL = "/api/adms/config";
export const ADMS_DEVICES_URL = "/api/adms/devices";
export const ADMS_EVENTS_URL = "/api/adms/events";

/**
 * Validates and parses the ADMS config response.
 * Caller must ensure the configured ADMS host is reachable.
 */
export async function fetchAdmsConfig(): Promise<AdmsConfig> {
  const res = await fetch(`${ADMS_CONFIG_URL}?API_USER=&API_KEY=`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ADMS GET ${ADMS_CONFIG_URL} failed: ${res.status} ${res.statusText}${body ? ` - body: ${body.slice(0, 300)}` : ""}`);
  }
  const json = await res.json();
  return admsConfigSchema.parse(json);
}

/** GET /api/adms/devices */
export async function fetchAdmsDevices(): Promise<AdmsDeviceRaw[]> {
  const res = await fetch(`${ADMS_DEVICES_URL}?API_USER=&API_KEY=`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ADMS GET ${ADMS_DEVICES_URL} failed: ${res.status} ${res.statusText}${body ? ` - body: ${body.slice(0, 300)}` : ""}`);
  }
  const json = await res.json();
  return admsDevicesResponseSchema.parse(json).devices;
}

/** POST /api/adms/events — push an attendance event to the ADMS (SISTEMA device) */
export async function postAdmsEvent(payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${ADMS_EVENTS_URL}?API_USER=&API_KEY=`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ADMS POST ${ADMS_EVENTS_URL} failed: ${res.status} ${res.statusText}${body ? ` - body: ${body.slice(0, 300)}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Validation schemas (used by the API route)
// ---------------------------------------------------------------------------

const admsConfigSchema = z.object({
  admsHost: z.string().default(""),
  admsPort: z.number().int().positive().default(8080),
  admsProtocol: z.enum(["http", "https"]).default("http"),
  timeoutMs: z.number().int().positive().default(15000),
  active: z.boolean().default(true),
});

export { admsConfigSchema };