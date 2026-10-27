"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assignMachineToRig } from "@/lib/matching";

const RIG_TYPES = ["DIAMANTINA", "AIRE_REVERSO", "MULTIPROPOSITO"] as const;
const EFFECTIVE_TYPES = ["DIAMANTINA", "AIRE_REVERSO"] as const;

const RIG_TYPE_LABELS: Record<string, string> = {
  DIAMANTINA: "Diamantina",
  AIRE_REVERSO: "Aire Reverso",
  MULTIPROPOSITO: "Multipropósito",
};

const createSiteSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  code: z.string().max(50).optional().or(z.literal("")),
});

export type CreateSiteState = { error?: string; success?: string };

export async function createSiteAction(
  _prev: CreateSiteState,
  formData: FormData,
): Promise<CreateSiteState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can create sites" };
  }

  const parsed = createSiteSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await db.site.create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code || null,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) {
      return { error: "A site with this code already exists" };
    }
    return { error: "Failed to create site" };
  }

  revalidatePath("/sites");
  return { success: `Site "${parsed.data.name}" created` };
}

// -------------------- Update site settings (address, GPS, radius) --------------------

const updateSiteSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100),
  code: z.string().max(50).optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal("")),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal("")),
  gpsRadiusKm: z.coerce.number().min(0.1).max(500).default(5),
  autoApproveGps: z.boolean().default(true),
});

export type UpdateSiteState = { error?: string; success?: string };

export async function updateSiteAction(
  _prev: UpdateSiteState,
  formData: FormData,
): Promise<UpdateSiteState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can edit site settings" };
  }

  const latRaw = formData.get("latitude");
  const lonRaw = formData.get("longitude");
  const parsed = updateSiteSchema.safeParse({
    siteId: formData.get("siteId"),
    name: formData.get("name"),
    code: formData.get("code") ?? "",
    address: formData.get("address") ?? "",
    latitude: latRaw === "" || latRaw === null ? undefined : latRaw,
    longitude: lonRaw === "" || lonRaw === null ? undefined : lonRaw,
    gpsRadiusKm: formData.get("gpsRadiusKm") || 5,
    autoApproveGps: formData.get("autoApproveGps") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const lat = parsed.data.latitude === "" ? null : (parsed.data.latitude ?? null);
    const lon = parsed.data.longitude === "" ? null : (parsed.data.longitude ?? null);
    await db.site.update({
      where: { id: parsed.data.siteId },
      data: {
        name: parsed.data.name,
        code: parsed.data.code || null,
        address: parsed.data.address || null,
        latitude: lat,
        longitude: lon,
        gpsRadiusKm: parsed.data.gpsRadiusKm,
        autoApproveGps: parsed.data.autoApproveGps,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) {
      return { error: "A site with this code already exists" };
    }
    return { error: "Failed to update site" };
  }

  revalidatePath("/sites");
  revalidatePath("/site-attribution");
  return { success: `Site "${parsed.data.name}" updated` };
}

// -------------------- Rig / machine assignment to a site --------------------

export type RigActionState = { error?: string; success?: string };

/** Add a planilla machine spelling as an alias of an existing rig. */
export async function addRigAliasAction(rigId: string, machine: string): Promise<RigActionState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can add rig aliases" };
  }
  const value = machine.trim();
  if (!value || value.length > 200) return { error: "Enter a machine alias" };
  try {
    await assignMachineToRig(value, rigId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add rig alias" };
  }
  revalidatePath("/sites");
  return { success: `Alias "${value}" added` };
}

/** Assign an unassigned rig/machine to a site, with optional effective type for multipurpose rigs. */
export async function assignRigToSiteAction(
  rigId: string,
  siteId: string,
  effectiveType?: string,
): Promise<RigActionState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can assign rigs" };
  }
  const rig = await db.rig.findUnique({ where: { id: rigId }, select: { id: true, name: true, siteId: true, rigType: true } });
  if (!rig) return { error: "Rig not found" };
  if (rig.siteId) return { error: `Rig "${rig.name}" already belongs to another site` };
  if (effectiveType && !(EFFECTIVE_TYPES as readonly string[]).includes(effectiveType)) {
    return { error: "Invalid effective type (use Diamantina or Aire Reverso)" };
  }
  if (rig.rigType === "MULTIPROPOSITO" && !effectiveType) {
    return { error: `Rig "${rig.name}" is multipurpose — choose Diamantina or Aire Reverso for this site` };
  }
  await db.$transaction([
    db.rig.update({ where: { id: rigId }, data: { siteId } }),
    db.siteRig.upsert({
      where: { rigId },
      create: {
        siteId,
        rigId,
        effectiveType: (effectiveType as "DIAMANTINA" | "AIRE_REVERSO" | undefined) ?? null,
      },
      update: {
        siteId,
        effectiveType: (effectiveType as "DIAMANTINA" | "AIRE_REVERSO" | undefined) ?? null,
      },
    }),
  ]);
  revalidatePath("/sites");
  revalidatePath("/reports");
  return { success: `Rig "${rig.name}" assigned to site` };
}

/** Remove a rig from its site (becomes unassigned). */
export async function removeRigFromSiteAction(rigId: string): Promise<RigActionState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can remove rigs" };
  }
  await db.$transaction([
    db.siteRig.deleteMany({ where: { rigId } }),
    db.rig.update({ where: { id: rigId }, data: { siteId: null } }),
  ]);
  revalidatePath("/sites");
  revalidatePath("/reports");
  return { success: "Rig removed from site" };
}

/** Update a rig's base drilling type (DIAMANTINA | AIRE_REVERSO | MULTIPROPOSITO). */
export async function updateRigTypeAction(rigId: string, rigType: string): Promise<RigActionState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can edit rigs" };
  }
  if (!(RIG_TYPES as readonly string[]).includes(rigType)) {
    return { error: "Invalid rig type" };
  }
  await db.rig.update({
    where: { id: rigId },
    data: { rigType: rigType as "DIAMANTINA" | "AIRE_REVERSO" | "MULTIPROPOSITO" },
  });
  revalidatePath("/sites");
  return { success: "Rig type updated" };
}

/** Update the per-site effective type of a (multipurpose) rig deployment. */
export async function updateSiteRigTypeAction(rigId: string, effectiveType: string): Promise<RigActionState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can edit rigs" };
  }
  if (!(EFFECTIVE_TYPES as readonly string[]).includes(effectiveType)) {
    return { error: "Invalid effective type (use Diamantina or Aire Reverso)" };
  }
  const rig = await db.rig.findUnique({ where: { id: rigId }, select: { id: true, siteId: true } });
  if (!rig?.siteId) return { error: "Rig is not assigned to a site" };
  await db.siteRig.upsert({
    where: { rigId },
    create: { siteId: rig.siteId, rigId, effectiveType: effectiveType as "DIAMANTINA" | "AIRE_REVERSO" },
    update: { effectiveType: effectiveType as "DIAMANTINA" | "AIRE_REVERSO" },
  });
  revalidatePath("/sites");
  return { success: "Site drilling type updated" };
}

/** Delete a rig permanently (data cleanup). */
export async function deleteRigAction(rigId: string): Promise<RigActionState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can delete rigs" };
  }
  await db.rig.delete({ where: { id: rigId } });
  revalidatePath("/sites");
  return { success: "Rig deleted" };
}
