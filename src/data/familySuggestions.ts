import type { Suggestion } from "../types";

export const FAMILY_SUGGESTIONS: Suggestion[] = (
  [
    // ─── FAMILY MEMBERS ───
    { q: "Full names and dates of birth of all family members?", cat: "👨‍👩‍👧 Family", p: "high" },
    { q: "ID numbers for each family member?", cat: "👨‍👩‍👧 Family", p: "high" },
    { q: "Passport numbers and expiry dates for each family member?", cat: "👨‍👩‍👧 Family", p: "high" },
    { q: "Each family member's cell number?", cat: "👨‍👩‍👧 Family", p: "high" },
    { q: "Each family member's email address?", cat: "👨‍👩‍👧 Family", p: "medium" },

    // ─── HOUSEHOLD ───
    { q: "Home address and postal code?", cat: "🏠 Household", p: "high" },
    {
      q: "Landlord or property manager name and number (if renting)?",
      cat: "🏠 Household",
      p: "high",
    },
    { q: "Home Wi-Fi network name and password?", cat: "🏠 Household", p: "medium" },
    { q: "Monthly rent or bond payment amount and due date?", cat: "🏠 Household", p: "high" },
    { q: "Rates and utilities accounts — account numbers?", cat: "🏠 Household", p: "medium" },
    {
      q: "Home alarm system code and armed response company number?",
      cat: "🏠 Household",
      p: "high",
    },
    { q: "Armed response account number and technician number?", cat: "🏠 Household", p: "high" },
    { q: "Gate/garage door remote codes?", cat: "🏠 Household", p: "medium" },
    { q: "Plumber contact number?", cat: "🏠 Household", p: "medium" },
    { q: "Electrician contact number?", cat: "🏠 Household", p: "medium" },
    { q: "Garden service / domestic worker name, days, and rate?", cat: "🏠 Household", p: "low" },
    { q: "Refuse collection day and municipal contact?", cat: "🏠 Household", p: "low" },

    // ─── CHILDREN ───
    { q: "Children's school names and physical addresses?", cat: "🎒 Children", p: "high" },
    { q: "School contact numbers and principal's name?", cat: "🎒 Children", p: "high" },
    { q: "Class teacher names for each child?", cat: "🎒 Children", p: "medium" },
    { q: "School WhatsApp group details for each child?", cat: "🎒 Children", p: "medium" },
    { q: "School term dates for the year?", cat: "🎒 Children", p: "medium" },
    { q: "Each child's GP and medical aid membership number?", cat: "🎒 Children", p: "high" },
    { q: "Children's allergies or medical conditions?", cat: "🎒 Children", p: "high" },
    { q: "After-school activities — what, where, time, cost?", cat: "🎒 Children", p: "medium" },
    {
      q: "Children's device screen time rules or parental controls in place?",
      cat: "🎒 Children",
      p: "low",
    },

    // ─── EMERGENCY ───
    { q: "Emergency meeting point if you can't reach home?", cat: "🚨 Emergency", p: "high" },
    { q: "Nearest hospital and trauma unit to your home?", cat: "🚨 Emergency", p: "high" },
    { q: "Family doctor and after-hours number?", cat: "🚨 Emergency", p: "high" },
    { q: "Poison control number (SA: 0861 555 777)?", cat: "🚨 Emergency", p: "high" },
    {
      q: "Who to contact if parents are unreachable — trusted adult name and number?",
      cat: "🚨 Emergency",
      p: "high",
    },
    {
      q: "Medical aid emergency number for each family member's plan?",
      cat: "🚨 Emergency",
      p: "high",
    },

    // ─── SHARED FINANCES ───
    { q: "Shared bank account details and who has access?", cat: "💳 Finances", p: "high" },
    {
      q: "Monthly household budget — total income vs total expenses?",
      cat: "💳 Finances",
      p: "high",
    },
    {
      q: "Major recurring debit orders — what, how much, which account?",
      cat: "💳 Finances",
      p: "high",
    },
    {
      q: "Family savings goal — what for and how much saved so far?",
      cat: "💳 Finances",
      p: "medium",
    },
    {
      q: "Life insurance policies — provider, policy number, beneficiaries?",
      cat: "💳 Finances",
      p: "high",
    },
    { q: "Funeral cover provider and policy number?", cat: "💳 Finances", p: "high" },
    { q: "Vehicle insurance — provider, policy number, excess?", cat: "💳 Finances", p: "high" },
    {
      q: "Household contents insurance — provider and policy number?",
      cat: "💳 Finances",
      p: "high",
    },
    { q: "Who has power of attorney if needed?", cat: "💳 Finances", p: "medium" },
    { q: "Wills — who has them, where are the originals kept?", cat: "💳 Finances", p: "high" },

    // ─── VEHICLES ───
    {
      q: "Each vehicle's make, model, year, and registration number?",
      cat: "🚗 Vehicles",
      p: "high",
    },
    { q: "Vehicle licence renewal dates and cost?", cat: "🚗 Vehicles", p: "high" },
    { q: "Mechanic name and contact number?", cat: "🚗 Vehicles", p: "medium" },
    { q: "Next service date and mileage for each vehicle?", cat: "🚗 Vehicles", p: "medium" },
    { q: "Roadside assistance provider and number?", cat: "🚗 Vehicles", p: "high" },

    // ─── PETS ───
    { q: "Pets' names, breeds, and vet contact details?", cat: "🐾 Pets", p: "medium" },
    { q: "Pet microchip numbers?", cat: "🐾 Pets", p: "medium" },
    { q: "Pet vaccinations — what, when last done, when due?", cat: "🐾 Pets", p: "medium" },
    { q: "Pet insurance provider and policy number?", cat: "🐾 Pets", p: "low" },

    // ─── DIGITAL ───
    { q: "Streaming subscriptions — which ones and monthly cost?", cat: "💻 Digital", p: "low" },
    {
      q: "Family cloud storage plan — provider and how much space left?",
      cat: "💻 Digital",
      p: "low",
    },
    {
      q: "Most important shared passwords (note: store securely)?",
      cat: "💻 Digital",
      p: "medium",
    },
  ] as Suggestion[]
).sort((a, b) => {
  const w: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return (w[b.p] || 0) - (w[a.p] || 0) + (Math.random() - 0.5) * 0.5;
});
