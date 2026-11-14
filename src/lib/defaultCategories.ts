import type { Prisma } from "@prisma/client";
import { diffFields, recordAuditEntries } from "./audit";

export interface CategoryGroupSeed {
  name: string;
  categories: readonly string[];
}

/**
 * The category groups (and their categories) every new budget starts with
 * (#196), in display order — array position becomes `sortOrder`. Copied
 * from the owner's household-budget sheet; Hebrew only, since the app has
 * no i18n yet (#199). Existing budgets are never seeded.
 */
export const DEFAULT_CATEGORY_GROUPS: readonly CategoryGroupSeed[] = [
  {
    name: "מזון ופארמה",
    categories: [
      "מזון",
      "פארמה וטואלטיקה",
      "בר מים",
      "אוכל מוכן / בעבודה",
      "עישון",
      "מזון ופארמה - כללי",
    ],
  },
  {
    name: "פנאי, בילוי ותחביבים",
    categories: [
      "מסעדה ואוכל בחוץ",
      "ספורט",
      "חופשות",
      "בילויים ומופעים",
      "חיות מחמד",
      "חוגי מבוגרים",
      "בייביסיטר",
      "הגרלות",
      "פנאי - כללי",
    ],
  },
  {
    name: "ביגוד והנעלה",
    categories: ["ביגוד הורים", "ביגוד ילדים", "נעליים", "ביגוד והנעלה - כללי"],
  },
  {
    name: "תכולת בית",
    categories: [
      "ריהוט",
      "מוצרי חשמל ואלקטרוניקה",
      "משחקים, צעצועים וספרים",
      "כלי בית",
      "תכולת בית - כללי",
    ],
  },
  {
    name: "אחזקת בית",
    categories: [
      "חשמל",
      "מים וביוב",
      "גז",
      "תיקונים",
      "ניקיון בבית / במכשירים",
      "גינה",
      "אחזקת בית - כללי",
    ],
  },
  {
    name: "טיפוח",
    categories: ["מספרה", "קוסמטיקה", "טיפוח - כללי"],
  },
  {
    name: "חינוך",
    categories: [
      "בית ספר",
      "מסגרות צהריים",
      "מסגרות יום",
      "מעון / מטפלת",
      "הסעות",
      "שיעור פרטי",
      "מסגרות קיץ",
      "חוגים ותנועת נוער",
      "לימודים והשתלמות לבוגרים",
      "חינוך - כללי",
    ],
  },
  {
    name: "אירועים, תרומות, צרכי דת",
    categories: ["חגים וצרכי דת", "אירוע בעבודה / לחברים", "תרומות"],
  },
  {
    name: "בריאות",
    categories: [
      'קופ"ח תשלום קבוע',
      "ביטוח רפואי נוסף",
      "טיפולים פרטיים",
      "טיפולי שיניים",
      "תרופות",
      "אופטיקה",
      "בריאות - כללי",
    ],
  },
  {
    name: "תחבורה",
    categories: [
      "דלק",
      "חניה",
      "כבישי אגרה",
      "ביטוח רכב",
      "תחזוקת רכב",
      "תחבורה ציבורית",
      "רישוי רכב",
      "תחבורה שיתופית",
      "ליסינג",
      "תחבורה - כללי",
    ],
  },
  {
    name: "משפחה",
    categories: [
      "אירוע שמחות במשפחה",
      "דמי כיס",
      "עזרה למשפחה",
      "תשלום מזונות",
      "משפחה - כללי",
    ],
  },
  {
    name: "תקשורת",
    categories: [
      "טלפון נייד ונייח",
      "טלוויזיה ואינטרנט (ספק ותשתית)",
      "שירותי תוכן",
      "תקשורת - כללי",
    ],
  },
  {
    name: "דיור",
    categories: [
      "משכנתא",
      "שכר דירה",
      "מסי ישוב / ועד בית",
      "ארנונה",
      "ביטוח נכס ותכולה",
      "דיור - כללי",
    ],
  },
  {
    name: "התחייבויות",
    categories: ["החזר חובות חודשי (למעט משכנתא) - כללי", "ריבית משיכת יתר"],
  },
  {
    name: "נכסים",
    categories: ["הפקדות לחסכונות - כללי"],
  },
  {
    name: "פיננסים",
    categories: [
      "עמלות",
      "ביטוח חיים",
      "ביטוח לאומי (למי שלא עובד)",
      "פיננסים - כללי",
    ],
  },
];

/**
 * Creates `groups` (and their categories) in a freshly created budget on
 * the caller's `tx`, so the seed commits or rolls back together with the
 * budget itself. Array position becomes `sortOrder`. Batched — one insert
 * for the groups, one for the categories, one for their audit entries
 * (ADR 0002) — rather than ~200 per-row round trips inside the
 * interactive transaction. An empty list (a Blank budget) writes nothing.
 */
export async function seedCategoryGroups(
  tx: Prisma.TransactionClient,
  {
    budgetId,
    actorId,
    groups: seed,
  }: { budgetId: string; actorId: string; groups: readonly CategoryGroupSeed[] },
): Promise<void> {
  if (seed.length === 0) return;

  const groups = await tx.categoryGroup.createManyAndReturn({
    data: seed.map((group, sortOrder) => ({
      budgetId,
      name: group.name,
      sortOrder,
    })),
  });
  // Match by sortOrder (unique within this seed) rather than trusting the
  // order RETURNING hands rows back in.
  const groupIdBySortOrder = new Map(groups.map((g) => [g.sortOrder, g.id]));

  const categoryRows = seed.flatMap((group, groupSortOrder) =>
    group.categories.map((name, sortOrder) => ({
      categoryGroupId: groupIdBySortOrder.get(groupSortOrder)!,
      name,
      sortOrder,
    })),
  );
  const categories =
    categoryRows.length > 0
      ? await tx.category.createManyAndReturn({ data: categoryRows })
      : [];

  await recordAuditEntries(tx, [
    ...groups.map((g) => ({
      budgetId,
      entityType: "CATEGORY_GROUP" as const,
      entityId: g.id,
      action: "created",
      actorId,
      changes: diffFields({}, { name: g.name, sortOrder: g.sortOrder }),
    })),
    ...categories.map((c) => ({
      budgetId,
      entityType: "CATEGORY" as const,
      entityId: c.id,
      action: "created",
      actorId,
      changes: diffFields(
        {},
        { categoryGroupId: c.categoryGroupId, name: c.name, sortOrder: c.sortOrder },
      ),
    })),
  ]);
}
