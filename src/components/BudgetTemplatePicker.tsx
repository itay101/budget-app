"use client";

import { useState } from "react";
import { BUDGET_TEMPLATES, DEFAULT_TEMPLATE_ID, getBudgetTemplate } from "@/lib/budgetTemplates";

/**
 * The new-budget form's "Start with" field (#212): a `template` select
 * over every BudgetTemplate (Beginner preselected), plus a scrolling
 * preview of the selected one's groups and categories so the user sees
 * what they'll get before creating. Submits with the surrounding form;
 * the preview is the only reason it keeps state.
 */
export function BudgetTemplatePicker() {
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const selected = getBudgetTemplate(templateId);

  return (
    <div>
      <label className="block text-small text-neutral-600" htmlFor="new-budget-template">
        Start with
      </label>
      <select
        id="new-budget-template"
        name="template"
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        aria-describedby="new-budget-template-preview"
        className="mt-1 w-full rounded-sm border border-neutral-200 px-2 py-1 text-body focus:border-brand-700 focus:outline-hidden focus:ring-1 focus:ring-brand-700"
      >
        {BUDGET_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {selected && (
        <div
          id="new-budget-template-preview"
          role="region"
          aria-label={`${selected.name} categories`}
          className="mt-1 max-h-40 overflow-y-auto rounded-sm bg-neutral-50 px-2 py-1 text-small text-neutral-600"
        >
          <p>{selected.description}</p>
          {selected.groups.map((group) => (
            <div key={group.name} className="mt-1">
              <p className="font-medium text-neutral-800">{group.name}</p>
              <ul className="pl-2">
                {group.categories.map((category) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
