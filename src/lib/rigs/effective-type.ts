import type { RigType } from "@prisma/client";

/** Effective (single) drilling type used by the best-rig engine rule. */
export type EffectiveRigType = "DIAMANTINA" | "AIRE_REVERSO";

export type RigWithDeployment = {
  id: string;
  name: string;
  rigType: RigType;
  siteRig?: { effectiveType: RigType | null } | null;
};

/**
 * Resolve the effective drilling type of a rig on its site.
 * Single-purpose rigs use their own rigType; MULTIPROPOSITO rigs use the
 * per-site SiteRig.effectiveType. Returns null when a multipurpose rig has
 * no site type configured (caller should block with a validation message).
 */
export function resolveEffectiveRigType(rig: RigWithDeployment): EffectiveRigType | null {
  if (rig.rigType === "MULTIPROPOSITO") {
    const eff = rig.siteRig?.effectiveType;
    if (eff === "DIAMANTINA" || eff === "AIRE_REVERSO") return eff;
    return null;
  }
  return rig.rigType as EffectiveRigType;
}

/** Build the rigName -> effective-type map consumed by the bonus engine. */
export function buildRigTypesMap(
  rigs: Array<RigWithDeployment & { name: string }>,
): Record<string, EffectiveRigType> {
  const map: Record<string, EffectiveRigType> = {};
  for (const rig of rigs) {
    const eff = resolveEffectiveRigType(rig);
    if (eff) map[rig.name] = eff;
  }
  return map;
}

/** Rigs (by name) that still need a site effective type before a run. */
export function unconfiguredMultipurposeRigs(
  rigs: Array<RigWithDeployment & { name: string }>,
): string[] {
  return rigs
    .filter((r) => r.rigType === "MULTIPROPOSITO" && !resolveEffectiveRigType(r))
    .map((r) => r.name);
}
