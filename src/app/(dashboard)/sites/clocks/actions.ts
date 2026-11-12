"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

const SITE_SCHEMA = z.object({
  siteId: z.string().min(1),
});

const DEVICE_SCHEMA = z.object({
  deviceId: z.string().min(1),
});

const CREATE_DEVICE_SCHEMA = z.object({
  deviceName: z.string().min(1, "Device name is required"),
  siteId: z.string().min(1, "Select a site"),
  deviceType: z
    .enum(["biometric", "mobile", "web", "sistema"])
    .default("biometric"),
});

export type CreateDeviceState = { error?: string; success?: string };

export async function createDeviceAction(
  _prev: CreateDeviceState,
  formData: FormData,
): Promise<CreateDeviceState> {
  const error = await requireAdmin();
  if (error) return error;

  const parsed = CREATE_DEVICE_SCHEMA.safeParse({
    deviceName: formData.get("deviceName"),
    siteId: formData.get("siteId"),
    deviceType: formData.get("deviceType"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const deviceName = String(parsed.data.deviceName).trim();

  try {
    const existing = await db.device.findUnique({
      where: { name: deviceName },
    });
    if (existing) {
      return {
        error: `A device named "${deviceName}" already exists.`,
      };
    }

    await db.device.create({
      data: {
        name: deviceName,
        siteId: parsed.data.siteId,
        deviceType: parsed.data.deviceType,
        isActive: true,
      },
    });
  } catch (e) {
    if (e instanceof Error && /unique/i.test(e.message ?? "")) {
      return {
        error: `A device named "${deviceName}" already exists.`,
      };
    }
    return { error: "Failed to create device." };
  }

  revalidatePath("/sites/clocks");
  return { success: `Device "${deviceName}" created.` };
}

const ASSIGN_SCHEMA = SITE_SCHEMA.and(DEVICE_SCHEMA);
const MOVE_SCHEMA = SITE_SCHEMA.and(DEVICE_SCHEMA);
const DEACTIVATE_SCHEMA = DEVICE_SCHEMA;

export type DeviceActionState = { error?: string; success?: string };

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "admin" && session?.user.role !== "supervisor") {
    return { error: "Only admins and supervisors can manage devices." };
  }
  return null;
}

async function getSiteNameById(siteId: string | null): Promise<string | null> {
  if (!siteId) return null;
  const site = await db.site.findUnique({ where: { id: siteId }, select: { name: true } });
  return site?.name ?? null;
}

const RIG_SCHEMA = z.object({
  rigId: z.string().min(1),
});

const ASSIGN_RIG_SCHEMA = DEVICE_SCHEMA.and(RIG_SCHEMA);

export async function assignDeviceToRigAction(
  _prev: DeviceActionState,
  formData: FormData,
): Promise<DeviceActionState> {
  const error = await requireAdmin();
  if (error) return error;

  const parsed = ASSIGN_RIG_SCHEMA.safeParse({
    deviceId: formData.get("deviceId"),
    rigId: formData.get("rigId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const rig = await db.rig.findUnique({
      where: { id: parsed.data.rigId },
      select: { id: true, siteId: true },
    });
    if (!rig) return { error: "The selected rig no longer exists." };

    await db.device.update({
      where: { id: parsed.data.deviceId },
      data: {
        rigId: parsed.data.rigId,
        siteId: rig.siteId ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("foreign")) {
      return { error: "The selected device or rig no longer exists." };
    }
    return { error: "Failed to assign device to rig." };
  }

  revalidatePath("/sites/clocks");
  revalidatePath("/sites");
  return { success: "Device assigned to rig." };
}

export async function assignDeviceToSiteAction(
  _prev: DeviceActionState,
  formData: FormData,
): Promise<DeviceActionState> {
  const error = await requireAdmin();
  if (error) return error;

  const parsed = ASSIGN_SCHEMA.safeParse({
    deviceId: formData.get("deviceId"),
    siteId: formData.get("siteId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await db.device.update({
      where: { id: parsed.data.deviceId },
      data: { siteId: parsed.data.siteId },
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("foreign")) {
      return { error: "The selected site no longer exists." };
    }
    return { error: "Failed to assign device to site." };
  }

  revalidatePath("/sites/clocks");
  revalidatePath("/sites");
  return { success: "Device assigned to site." };
}

export async function moveDeviceToSiteAction(
  _prev: DeviceActionState,
  formData: FormData,
): Promise<DeviceActionState> {
  const error = await requireAdmin();
  if (error) return error;

  const parsed = ASSIGN_SCHEMA.safeParse({
    deviceId: formData.get("deviceId"),
    siteId: formData.get("siteId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await db.device.update({
      where: { id: parsed.data.deviceId },
      data: { siteId: parsed.data.siteId },
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("foreign")) {
      return { error: "The selected site no longer exists." };
    }
    return { error: "Failed to move device to site." };
  }

  revalidatePath("/sites/clocks");
  revalidatePath("/sites");
  return { success: "Device moved to site." };
}

export async function toggleDeviceActiveAction(
  _prev: DeviceActionState,
  formData: FormData,
): Promise<DeviceActionState> {
  const error = await requireAdmin();
  if (error) return error;

  const parsed = DEACTIVATE_SCHEMA.safeParse({
    deviceId: formData.get("deviceId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let device: { isActive: boolean } | null = null;
  try {
    device = await db.device.findUnique({ where: { id: parsed.data.deviceId }, select: { isActive: true } });
    if (!device) return { error: "Device not found." };
    await db.device.update({
      where: { id: parsed.data.deviceId },
      data: { isActive: !device.isActive },
    });
  } catch (e) {
    return { error: "Failed to update device." };
  }

  revalidatePath("/sites/clocks");
  return { success: device.isActive ? "Device deactivated." : "Device reactivated." };
}
