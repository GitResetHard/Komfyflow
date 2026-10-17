import { describe, expect, it } from "vitest";
import {
  accessibleWhere,
  canDiscoverWorkflow,
  canViewWorkflow,
  discoveryWhere,
} from "../../src/lib/server/access";
const viewers = [
  { name: "guest", id: undefined, adultOptIn: false },
  { name: "ordinary account", id: "reader", adultOptIn: false },
  { name: "owner without opt-in", id: "owner", adultOptIn: false },
  { name: "opted-in guest", id: undefined, adultOptIn: true },
  { name: "opted-in account", id: "reader", adultOptIn: true },
  { name: "opted-in owner", id: "owner", adultOptIn: true },
];
describe("workflow access security matrix", () => {
  it("fails closed for unknown visibility even for owner", () => {
    for (const viewer of viewers)
      expect(
        canViewWorkflow(
          { authorId: "owner", visibility: "UNKNOWN", adult: false },
          viewer,
        ),
      ).toBe(false);
  });
  for (const viewer of viewers)
    for (const visibility of ["PUBLIC", "PRIVATE", "UNLISTED"])
      for (const adult of [false, true]) {
        it(`${viewer.name}: ${visibility} adult=${adult}`, () => {
          const resource = { authorId: "owner", visibility, adult };
          const adultAllowed = !adult || viewer.adultOptIn;
          expect(canViewWorkflow(resource, viewer)).toBe(
            adultAllowed && (visibility !== "PRIVATE" || viewer.id === "owner"),
          );
          expect(canDiscoverWorkflow(resource, viewer)).toBe(
            adultAllowed && visibility === "PUBLIC",
          );
        });
      }
  it("all default discovery queries exclude both adult and non-public content", () => {
    expect(discoveryWhere({ adultOptIn: false })).toEqual({
      visibility: "PUBLIC",
      adult: false,
      versions: { some: { status: "READY" } },
    });
    expect(discoveryWhere({ id: "owner", adultOptIn: false })).toEqual({
      visibility: "PUBLIC",
      adult: false,
      versions: { some: { status: "READY" } },
    });
  });
  it("opt-in removes only the adult filter, never the visibility filter", () => {
    expect(discoveryWhere({ id: "owner", adultOptIn: true })).toEqual({
      visibility: "PUBLIC",
      versions: { some: { status: "READY" } },
    });
  });
  it("guest direct-access query never introduces an owner bypass", () => {
    expect(accessibleWhere({ adultOptIn: false })).toEqual({
      adult: false,
      OR: [
        {
          visibility: { in: ["PUBLIC", "UNLISTED"] },
          versions: { some: { status: "READY" } },
        },
      ],
    });
  });
  it("account access preserves adult filtering even for own content", () => {
    expect(accessibleWhere({ id: "owner", adultOptIn: false })).toEqual({
      adult: false,
      OR: [
        {
          visibility: { in: ["PUBLIC", "UNLISTED"] },
          versions: { some: { status: "READY" } },
        },
        { authorId: "owner" },
      ],
    });
  });
});
