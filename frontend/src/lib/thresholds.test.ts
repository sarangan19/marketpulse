import { describe, expect, it } from "vitest";
import { checkThreshold } from "./thresholds";

describe("checkThreshold", () => {
  it("empty input clears the side", () => {
    expect(checkThreshold("upper", "  ", { upper: 200, lower: 150 })).toEqual({ ok: true, value: null });
  });

  it("parses numbers with commas and whitespace", () => {
    expect(checkThreshold("upper", " 1,250.5 ", { upper: null, lower: null })).toEqual({ ok: true, value: 1250.5 });
  });

  it("rejects non-numbers, zero and negatives", () => {
    for (const raw of ["abc", "0", "-5", "1e999"]) {
      expect(checkThreshold("lower", raw, { upper: null, lower: null })).toEqual({
        ok: false,
        error: "Enter a positive number",
      });
    }
  });

  it("lower must stay below the existing upper", () => {
    expect(checkThreshold("lower", "200", { upper: 200, lower: null })).toEqual({
      ok: false,
      error: "Must be below the upper alert (200.00)",
    });
    expect(checkThreshold("lower", "199.99", { upper: 200, lower: null })).toEqual({ ok: true, value: 199.99 });
  });

  it("upper must stay above the existing lower", () => {
    expect(checkThreshold("upper", "150", { upper: null, lower: 150 })).toEqual({
      ok: false,
      error: "Must be above the lower alert (150.00)",
    });
  });

  it("the side being edited is not compared with its own old value", () => {
    expect(checkThreshold("upper", "120", { upper: 200, lower: 100 })).toEqual({ ok: true, value: 120 });
  });
});
