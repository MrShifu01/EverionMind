/**
 * Retrieval eval fixtures.
 *
 * Each fixture asserts: "when a user asks <query> against <brainId>, the
 * returned entries must include titles matching <expectTitles>".
 *
 * `expectTitles` are regex patterns (case-insensitive). At least `minHits`
 * (defaults to `expectTitles.length`) must match a returned entry's title.
 *
 * Add new fixtures whenever a retrieval failure is reported. Every failure
 * mode goes here so the audit suite catches regressions on the next change.
 *
 * The fixtures below use Christian Stander's brain IDs because he's the
 * sole pre-launch user. Before opening this eval to other accounts, the
 * fixture format will need a multi-user shape (brainId per-user, or per-
 * fixture-suite). For now: single-user, single-eval.
 */

export interface Fixture {
  id: string;
  description: string;
  query: string;
  brainId: string;
  /** Each pattern is a JS regex (case-insensitive). Tested against entry titles. */
  expectTitles: string[];
  /** Min number of `expectTitles` patterns that must hit. Defaults to all. */
  minHits?: number;
  /** Override retrieval `limit`. Default 15. */
  limit?: number;
}

const MY_BRAIN = "8aa02367-0e54-498f-ad7c-d1b9b7f01c39";
// const STANDER_FAMILY = "d932b46a-7d00-4939-a29b-f47ca1438ede";
// const SMASH_BURGER = "70beace8-d44c-401a-8ff7-ca957220df27";

export const fixtures: Fixture[] = [
  // ─────────────────────────────────────────────────────────────────────
  // STAFF — the failure that triggered the audit (2026-05-12)
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "staff-list-all",
    description:
      "Asking for all staff must return every entry titled '<Name> - Staff Details'. " +
      "All six exist; pre-fix the keyword pass returned 0 hits due to wfts AND-join, " +
      "and the hybrid score didn't weight title matches enough to surface them.",
    query: "give me my staff details",
    brainId: MY_BRAIN,
    expectTitles: ["Landon", "Lesego", "Tshepang", "Benita", "Avela", "Teboho"],
    minHits: 6,
    limit: 30,
  },
  {
    id: "staff-by-first-name",
    description: "Searching by a staff member's first name must return their entry.",
    query: "Landon",
    brainId: MY_BRAIN,
    expectTitles: ["Landon Harris Klopper"],
  },
  {
    id: "staff-bloemfontein",
    description: "Asking for Bloemfontein staff should return the 5 BFN entries (not Teboho/Harrismith).",
    query: "staff in Bloemfontein",
    brainId: MY_BRAIN,
    expectTitles: ["Landon", "Lesego", "Tshepang", "Benita", "Avela"],
    minHits: 4,
    limit: 20,
  },

  // ─────────────────────────────────────────────────────────────────────
  // PEOPLE — service providers
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "person-electrician",
    description: "Asking who the electrician is must surface Reagan.",
    query: "who is my electrician",
    brainId: MY_BRAIN,
    expectTitles: ["Reagan"],
  },
  {
    id: "person-builder",
    description: "Asking about the builder must surface JC Kraal.",
    query: "who built Smash Burger Bar",
    brainId: MY_BRAIN,
    expectTitles: ["JC Kraal"],
  },
  {
    id: "person-shopfitter",
    description: "Asking about the shopfitter must surface Ruan.",
    query: "shopfitter",
    brainId: MY_BRAIN,
    expectTitles: ["Ruan"],
  },

  // ─────────────────────────────────────────────────────────────────────
  // SUPPLIERS
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "supplier-bidfoods",
    description: "Direct supplier lookup by name.",
    query: "Bidfoods",
    brainId: MY_BRAIN,
    expectTitles: ["Bidfoods"],
  },
  {
    id: "supplier-econofoods",
    description: "Direct supplier lookup by name.",
    query: "Econofoods",
    brainId: MY_BRAIN,
    expectTitles: ["Econofoods"],
  },
  {
    id: "supplier-juice-water",
    description: "Asking for the juice supplier must surface Willie (tagged juice + water).",
    query: "juice and water supplier",
    brainId: MY_BRAIN,
    expectTitles: ["Willie"],
  },
  {
    id: "supplier-kitchen-equipment",
    description: "Asking about kitchen equipment must surface Uria Foodserve / Uriah.",
    query: "kitchen equipment supplier",
    brainId: MY_BRAIN,
    expectTitles: ["Uria|Uriah"],
  },

  // ─────────────────────────────────────────────────────────────────────
  // COMPANY / BUSINESS
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "company-menu",
    description: "Asking about the menu must return the Smash Burger Bar Menu entry.",
    query: "Smash Burger Bar menu",
    brainId: MY_BRAIN,
    expectTitles: ["Menu"],
  },
  {
    id: "company-work-email",
    description: "Asking for the work email must return the Smashburger Bar Work Email entry.",
    query: "work email Smash Burger Bar",
    brainId: MY_BRAIN,
    expectTitles: ["Work Email|admin@smashburgerbar"],
  },

  // ─────────────────────────────────────────────────────────────────────
  // PERSONAL
  // ─────────────────────────────────────────────────────────────────────
  {
    id: "personal-father-id",
    description:
      "Asking for dad's / Henk's / father's ID must surface the Stander Family or Adriaan entry. " +
      "Tests alias-style queries — 'dad' is not in any entry; the link is 'father'.",
    query: "what is my dad's ID number",
    brainId: MY_BRAIN,
    expectTitles: ["Adriaan|Henk|Father|Stander Family"],
  },
  {
    id: "personal-girlfriend",
    description: "Asking about the girlfriend / partner must surface Yolandi.",
    query: "who is my girlfriend",
    brainId: MY_BRAIN,
    expectTitles: ["Yolandi"],
  },
];
