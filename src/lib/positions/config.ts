import { normalizeText } from "@/lib/excel/normalize";

/**
 * Bonus calculation position groups (configuration, NOT hard-coded in the engine).
 * Add/modify groups here — the engine will read assignments from the DB.
 */
export type PositionGroupConfig = {
  key: string;
  name: string;
  description: string;
  order: number;
  /** Known cargo name variants (normalized before matching) that belong to this group. */
  aliasNames: string[];
};

export const POSITION_GROUPS: PositionGroupConfig[] = [
  {
    key: "group1",
    name: "Group 1 – Supervision & Staff",
    description:
      "Supervisor / Sup Operacional, Jefe de Faena, Administrador de contrato, HSEC, Líder HSEC, Líder Mecánico",
    order: 1,
    aliasNames: [
      "SUPERVISOR",
      "SUP OPERACIONAL",
      "SUPERVISOR OPERACIONAL",
      "JEFE DE FAENA",
      "ADMINISTRADOR DE CONTRATO",
      "HSEC",
      "LIDER HSEC",
      "LIDER MECANICO",
      "ADMINISTRATIVO", // observed in planilla, treated as contract administration
    ],
  },
  {
    key: "group2",
    name: "Group 2 – Drilling Crew",
    description:
      "Perforista, Ayudante Perforista, Chofer/Conductor, Mecánico, Soldador, Electromecánico",
    order: 2,
    aliasNames: [
      "PERFORISTA",
      "PERFORISTA BU",
      "AYUDANTE PERFORISTA",
      "AYUDANTE", // observed in planilla; drilling helper
      "CHOFER",
      "CHOFER CONDUCTOR",
      "CHOFER TRADUCTOR",
      "CONDUCTOR",
      "CONDUCTOR TRADUCTOR",
      "MECANICO",
      "SOLDADOR",
      "ELECTRO MECANICO",
      "ELECTROMECANICO",
    ],
  },
];

/**
 * Main (canonical) position names and their known aliases.
 * The Positions page lets admins manage these in the DB; this config only
 * seeds known defaults. Aliases link to the main name, and the main name
 * optionally carries the default bonus group for its aliases.
 */
export type MainPositionConfig = {
  name: string;
  groupKey?: string;
  order: number;
  /** Known aliases of this main position (normalized before matching). */
  aliasNames: string[];
};

export const MAIN_POSITIONS: MainPositionConfig[] = [
  { name: "Administrador de Contrato", groupKey: "group1", order: 1, aliasNames: ["ADC"] },
  { name: "Supervisor", groupKey: "group1", order: 2, aliasNames: ["SUP OPERACIONAL", "SUPERVISOR OPERACIONAL"] },
  { name: "Jefe de Faena", groupKey: "group1", order: 3, aliasNames: [] },
  { name: "Perforista", groupKey: "group2", order: 4, aliasNames: ["PERFORISTA BU"] },
  { name: "Ayudante Perforista", groupKey: "group2", order: 5, aliasNames: ["AYUDANTE", "AYUDANTE PERFORISTA", "AYUDANTE DE PERFORISTA", "PERFORISTA TRAINING", "HELPER"] },
  { name: "Conductor", groupKey: "group2", order: 6, aliasNames: ["CHOFER", "CHOFER CONDUCTOR", "CHOFER TRADUCTOR", "CONDUCTOR TRADUCTOR"] },
  { name: "Mecánico", groupKey: "group2", order: 7, aliasNames: [] },
  { name: "Electromecánico", groupKey: "group2", order: 8, aliasNames: ["ELECTRO MECANICO"] },
  { name: "HSEC", groupKey: "group1", order: 9, aliasNames: ["LIDER HSEC"] },
  { name: "Líder Mecánico", groupKey: "group1", order: 10, aliasNames: ["LIDER MECANICO"] },
  { name: "Mecánico Líder", groupKey: "group1", order: 11, aliasNames: ["MECANICO LIDER"] },
  { name: "Administrativo", groupKey: "group1", order: 12, aliasNames: [] },
  { name: "Soldador", groupKey: "group2", order: 13, aliasNames: [] },
  { name: "Traductor", groupKey: "group2", order: 14, aliasNames: [] },
];

export const KNOWN_ALIAS_MAP: Map<string, { groupKey: string; displayName: string }> =
  (() => {
    const map = new Map<string, { groupKey: string; displayName: string }>();
    for (const g of POSITION_GROUPS) {
      for (const alias of g.aliasNames) {
        map.set(normalizeText(alias), { groupKey: g.key, displayName: alias });
      }
    }
    return map;
  })();
