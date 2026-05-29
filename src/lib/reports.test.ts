import { describe, expect, it } from "vitest";
import { csvEscape, escapeHtml, isWithinDateRange, rowsToCsv } from "./reports";

describe("report export helpers", () => {
  it("escapes CSV values and prevents spreadsheet formula injection", () => {
    expect(csvEscape("=IMPORTXML(\"http://bad\")")).toBe("\"'=IMPORTXML(\"\"http://bad\"\")\"");
    expect(rowsToCsv([{ Name: "Elline's Food Product", Notes: "safe, quoted" }])).toContain("\"safe, quoted\"");
  });

  it("escapes HTML used in print reports", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("filters dates inclusively", () => {
    expect(isWithinDateRange("2026-05-27T12:00:00Z", "2026-05-27", "2026-05-27")).toBe(true);
    expect(isWithinDateRange("2026-05-26T23:59:59Z", "2026-05-27", "2026-05-27")).toBe(false);
  });
});
