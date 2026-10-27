import "dotenv/config";
import {
  parseChileLocal,
  formatTimeChile,
  formatDateTimeChile,
  formatDateChile,
  chileHour,
  formatDateUtc,
} from "../src/lib/datetime";

function expect(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  console.log(`${ok ? "OK " : "FAIL"} ${label}: got ${String(got)}${ok ? "" : `, want ${String(want)}`}`);
  if (!ok) process.exitCode = 1;
}

// July = Chilean winter = UTC-4
const july = parseChileLocal("2026-07-01T08:00:00");
expect("July parse -> UTC instant", july.toISOString(), "2026-07-01T12:00:00.000Z");
expect("July format time", formatTimeChile(july), "08:00");
expect("July chile hour", chileHour(july), 8);
expect("July date", formatDateChile(july), "2026-07-01");

// January = Chilean summer (DST) = UTC-3
const jan = parseChileLocal("2026-01-10T22:30:00");
expect("January (DST) parse -> UTC", jan.toISOString(), "2026-01-11T01:30:00.000Z");
expect("January format time", formatTimeChile(jan), "22:30");
// Night-shift clock-in at 22:30 stays on the same Chilean calendar day
expect("January date (night shift key)", formatDateChile(jan), "2026-01-10");

// Midnight boundary: 00:15 belongs to its own day
const midnight = parseChileLocal("2026-07-02T00:15:00");
expect("Midnight hour", chileHour(midnight), 0);
expect("Midnight date", formatDateChile(midnight), "2026-07-02");

// Round-trip of a real UTC instant (e.g. DB timestamp) to Chile display
const nowUtc = new Date("2026-08-15T17:45:00.000Z"); // 13:45 in July Chile
expect("DB timestamp display", formatDateTimeChile(nowUtc), "2026-08-15 13:45");

// @db.Date column (UTC midnight) must not slip a day
expect("Date-only column", formatDateUtc(new Date("2026-08-01T00:00:00.000Z")), "2026-08-01");
