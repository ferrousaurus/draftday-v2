import { describe, expect, it } from "vitest";

import { envSchema } from "./testEnv.ts";

describe("envSchema", () => {
  it("accepts the three variables and coerces the league id to a number", () => {
    const parsed = envSchema.parse({
      VITE_ESPN_LEAGUE: "1234567",
      VITE_ESPN_S2: "abc",
      VITE_SWID: "def",
    });
    expect(parsed).toEqual({
      VITE_ESPN_LEAGUE: 1_234_567,
      VITE_ESPN_S2: "abc",
      VITE_SWID: "def",
    });
  });

  it("allows absent variables", () => {
    expect(envSchema.parse({})).toEqual({});
  });

  it("rejects a non-numeric league id", () => {
    expect(() => envSchema.parse({ VITE_ESPN_LEAGUE: "abc" })).toThrow();
  });

  it("rejects a non-integer league id", () => {
    expect(() => envSchema.parse({ VITE_ESPN_LEAGUE: "12.5" })).toThrow();
  });
});
