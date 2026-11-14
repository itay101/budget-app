import {
  BUDGET_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  FALLBACK_TEMPLATE_ID,
  getBudgetTemplate,
} from "./budgetTemplates";
import { DEFAULT_CATEGORY_GROUPS } from "./defaultCategories";

describe("BUDGET_TEMPLATES", () => {
  it("offers Blank, Household and the 39 ynab.com templates, with unique ids and names", () => {
    expect(BUDGET_TEMPLATES).toHaveLength(41);
    expect(BUDGET_TEMPLATES.slice(0, 4).map((t) => t.id)).toEqual([
      "blank",
      "household",
      "beginner",
      "minimalist",
    ]);
    expect(new Set(BUDGET_TEMPLATES.map((t) => t.id)).size).toBe(BUDGET_TEMPLATES.length);
    expect(new Set(BUDGET_TEMPLATES.map((t) => t.name)).size).toBe(BUDGET_TEMPLATES.length);
  });

  it("keeps Blank empty and Household equal to the pre-template defaults", () => {
    expect(getBudgetTemplate("blank")?.groups).toEqual([]);
    expect(getBudgetTemplate(FALLBACK_TEMPLATE_ID)?.groups).toBe(DEFAULT_CATEGORY_GROUPS);
    expect(getBudgetTemplate(DEFAULT_TEMPLATE_ID)?.name).toBe("Beginner");
  });

  it.each(BUDGET_TEMPLATES.filter((t) => t.id !== "blank").map((t) => [t.id, t] as const))(
    "%s has named, non-empty groups with no blank or duplicate names",
    (_id, template) => {
      expect(template.name.trim()).not.toBe("");
      expect(template.description.trim()).not.toBe("");
      expect(template.groups.length).toBeGreaterThan(0);
      const groupNames = template.groups.map((g) => g.name);
      expect(new Set(groupNames).size).toBe(groupNames.length);
      for (const group of template.groups) {
        expect(group.name.trim()).toBe(group.name);
        expect(group.name).not.toBe("");
        expect(group.categories.length).toBeGreaterThan(0);
        for (const name of group.categories) {
          expect(name.trim()).toBe(name);
          expect(name).not.toBe("");
        }
        expect(new Set(group.categories).size).toBe(group.categories.length);
      }
    },
  );

  it("drops YNAB's Read Me groups and YNAB branding", () => {
    for (const template of BUDGET_TEMPLATES) {
      expect(template.name).not.toMatch(/ynab/i);
      for (const group of template.groups) {
        expect(group.name).not.toMatch(/^read ?me/i);
        for (const name of group.categories) expect(name).not.toMatch(/ynab/i);
      }
    }
  });

  it("transcribes a template exactly, in page order", () => {
    expect(getBudgetTemplate("minimalist")?.groups).toEqual([
      {
        name: "The Simple Life",
        categories: ["🍔 Food", "🏠 Needs", "💸 Wants", "✈️ Travel", "🚨 Emergency", "💰 Savings"],
      },
    ]);
  });
});

describe("getBudgetTemplate", () => {
  it("returns undefined for an unknown id", () => {
    expect(getBudgetTemplate("nope")).toBeUndefined();
    expect(getBudgetTemplate("")).toBeUndefined();
  });
});
