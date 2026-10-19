import { describe, expect, it } from "vitest";
import { effectChips, naira, needTone, shareText } from "./format";

describe("format", () => {
  it("formats naira", () => {
    expect(naira(15000)).toBe("₦15,000");
    expect(naira(0)).toBe("₦0");
  });
  it("describes what an action does", () => {
    const chips = effectChips({ cost: 900, earn: 0, effects: { hunger: 55, energy: -12, prep: 0 } });
    expect(chips.map((c) => c.text)).toEqual(["−₦900", "+55 Food", "−12 Energy"]);
    expect(effectChips({ earn: 2200, effects: {} })[0]).toEqual({ text: "+₦2,200", tone: "good" });
  });
  it("flags low needs", () => {
    expect(needTone(10)).toBe("critical");
    expect(needTone(30)).toBe("low");
    expect(needTone(80)).toBe("ok");
  });
  it("writes the share message", () => {
    const card = { name: "Tunde", class: "First Class", cgpa: 4.6, profile: "Lapo Baby", department: "Economics" };
    expect(shareText(card, "https://x.test/c/abc")).toBe(
      "Tunde just graduated from Great Ife Life with First Class (4.60) as a Lapo Baby in Economics. Beat that: https://x.test/c/abc",
    );
  });
});

import { clockText, duration } from "./format";

it("clock and durations read like a Nigerian student would say them", () => {
  expect(clockText(0)).toBe("12:00 AM");
  expect(clockText(485)).toBe("8:05 AM");
  expect(clockText(780)).toBe("1:00 PM");
  expect(clockText(1440 + 61)).toBe("1:01 AM");
  expect(duration(45)).toBe("45 min");
  expect(duration(120)).toBe("2 hrs");
  expect(duration(135)).toBe("2 hr 15 min");
});
