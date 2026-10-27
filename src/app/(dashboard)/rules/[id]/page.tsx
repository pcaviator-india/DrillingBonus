import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EditRuleSetForm } from "./edit-rule-set-form";
import type { GroupOption, PositionOption } from "../components/rule-form-shared";

export default async function EditRuleSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [ruleSet, bonusTypes, mainPositions, groups] = await Promise.all([
    db.bonusRuleSet.findUnique({
      where: { id },
      include: { site: true, rules: { include: { bonusType: true }, orderBy: { priority: "asc" } } },
    }),
    db.bonusType.findMany({ orderBy: { displayOrder: "asc" } }),
    db.mainPosition.findMany({ orderBy: { order: "asc" } }),
    db.positionGroup.findMany({ orderBy: { order: "asc" } }),
  ]);

  if (!ruleSet) {
    notFound();
  }

  const groupNameByKey = new Map(groups.map((g) => [g.key, g.name]));
  const positionOptions: PositionOption[] = mainPositions.map((p) => ({
    name: p.name,
    groupKey: p.groupKey,
    groupName: p.groupKey ? (groupNameByKey.get(p.groupKey) ?? null) : null,
  }));
  const groupOptions: GroupOption[] = groups.map((g) => ({ key: g.key, name: g.name }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Edit Rule Set</h1>
        <p className="text-sm text-muted-foreground">
          {ruleSet.name} — {ruleSet.site.name}
        </p>
      </div>

      <EditRuleSetForm
        ruleSet={{
          id: ruleSet.id,
          name: ruleSet.name,
          effectiveFrom: ruleSet.effectiveFrom.toISOString().split("T")[0],
          effectiveTo: ruleSet.effectiveTo?.toISOString().split("T")[0] ?? null,
          isActive: ruleSet.isActive,
          rules: ruleSet.rules.map((r) => ({
            id: r.id,
            bonusTypeId: r.bonusTypeId,
            bonusTypeCode: r.bonusType.code,
            bonusTypeName: r.bonusType.name,
            positionFilter: r.positionFilter,
            drillingTypeFilter: r.drillingTypeFilter,
            priority: r.priority,
            minAttendanceDays: r.minAttendanceDays,
            parameters: (r.parameters ?? {}) as Record<string, unknown>,
            notes: r.notes,
          })),
        }}
        bonusTypes={bonusTypes.map((bt) => ({
          id: bt.id,
          code: bt.code,
          name: bt.name,
          description: bt.description,
        }))}
        positions={positionOptions}
        groups={groupOptions}
      />
    </div>
  );
}
