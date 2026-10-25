import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";

import { routes } from "@/router";

// Match routes without rendering: pages may need network access the test run lacks.
describe("App routing", () => {
  it.each(["/", "/app", "/signin", "/signup"])(
    "matches a page for %s instead of falling back to not found",
    (path) => {
      const matches = matchRoutes(routes, path);

      expect(matches?.at(-1)?.route.path).toBe(path);
    },
  );

  it("falls back to not found for unknown paths", () => {
    expect(matchRoutes(routes, "/nope")?.at(-1)?.route.path).toBe("*");
  });
});
