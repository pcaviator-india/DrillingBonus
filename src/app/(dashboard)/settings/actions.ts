"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { updateSettings } from "@/lib/settings";
import type { AppSettings } from "@/lib/settings";
import { db } from "@/lib/db";

export type SettingsState = { error?: string; message?: string };

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };
  try {
    await updateSettings({
      autoUploadClocksToWorkera: formData.get("autoUploadClocksToWorkera") === "on",
      autoSyncWorkeraToDb: formData.get("autoSyncWorkeraToDb") === "on",
      autoSyncWorkeraFrequency: (formData.get("autoSyncWorkeraFrequency") as AppSettings["autoSyncWorkeraFrequency"]) ?? "daily",
    });
    revalidatePath("/settings");
    return { message: "Settings saved." };
  } catch (error) {
    console.error("Failed to save settings:", error);
    return { error: "Failed to save settings: " + (error instanceof Error ? error.message : "Unknown error") };
  }
}

export async function exportDatabaseAction(): Promise<{ data?: string; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return { error: "Admin access required" };
  }

  try {
    const [
      sites,
      employees,
      roles,
      rigs,
      dailyCrewEntries,
      rigAliases,
      siteAliases,
      employeeWorkDays,
      attendanceRecords,
      positionGroups,
      mainPositions,
      positionAliases,
      bonusRuleSets,
      bonusRules,
      bonusTypes,
      bonusCalculations,
      calculationComparisons,
      employeeProjectAssignments,
      employeeProjectSuggestions,
      bonusExclusions,
      bestRigEligible,
      excelUploads,
      branchOffices,
      departments,
      devices,
      appSettings,
    ] = await Promise.all([
      db.site.findMany(),
      db.employee.findMany(),
      db.role.findMany(),
      db.rig.findMany(),
      db.dailyCrewEntry.findMany(),
      db.rigAlias.findMany(),
      db.siteAlias.findMany(),
      db.employeeWorkDay.findMany(),
      db.attendanceRecord.findMany(),
      db.positionGroup.findMany(),
      db.mainPosition.findMany(),
      db.positionAlias.findMany(),
      db.bonusRuleSet.findMany({ include: { rules: true } }),
      db.bonusRule.findMany(),
      db.bonusType.findMany(),
      db.bonusCalculation.findMany(),
      db.calculationComparison.findMany(),
      db.employeeProjectAssignment.findMany(),
      db.employeeProjectSuggestion.findMany(),
      db.bonusExclusion.findMany(),
      db.bestRigEligibleEmployee.findMany(),
      db.excelUpload.findMany(),
      db.branchOffice.findMany(),
      db.department.findMany(),
      db.device.findMany(),
      db.appSettings.findUnique({ where: { id: "singleton" } }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: session.user.email,
      data: {
        sites,
        employees,
        roles,
        rigs,
        dailyCrewEntries,
        rigAliases,
        siteAliases,
        employeeWorkDays,
        attendanceRecords,
        positionGroups,
        mainPositions,
        positionAliases,
        bonusRuleSets,
        bonusRules,
        bonusTypes,
        bonusCalculations,
        calculationComparisons,
        employeeProjectAssignments,
        employeeProjectSuggestions,
        bonusExclusions,
        bestRigEligible,
        excelUploads,
        branchOffices,
        departments,
        devices,
        appSettings,
      },
    };

    return { data: JSON.stringify(exportData, null, 2) };
  } catch (error) {
    console.error("Export failed:", error);
    return { error: "Export failed: " + (error instanceof Error ? error.message : "Unknown error") };
  }
} 