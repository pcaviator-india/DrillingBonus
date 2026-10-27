export const SHIFT_CONFIG = {
  /**
   * Day vs Night classification by the punch (clock-in) hour, local time.
   * Day shift: hour >= dayStartHour and hour < dayEndHour. Everything else = night.
   * Configured here so the boundary is tunable (per .clinerules rule #5).
   */
  dayStartHour: 6,
  dayEndHour: 18,
} as const;

export function determineShift(punchHour: number): "day" | "night" {
  if (punchHour >= SHIFT_CONFIG.dayStartHour && punchHour < SHIFT_CONFIG.dayEndHour) {
    return "day";
  }
  return "night";
}