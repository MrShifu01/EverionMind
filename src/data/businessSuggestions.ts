import type { Suggestion } from "../types";

export const BUSINESS_SUGGESTIONS: Suggestion[] = (
  [
    // ─── BUSINESS IDENTITY ───
    {
      q: "Registered business name and trading name (if different)?",
      cat: "🏢 Business",
      p: "high",
    },
    { q: "Business registration number (CIPC)?", cat: "🏢 Business", p: "high" },
    { q: "VAT registration number (if applicable)?", cat: "🏢 Business", p: "high" },
    { q: "Business address and postal address?", cat: "🏢 Business", p: "high" },
    { q: "Business email address and main contact number?", cat: "🏢 Business", p: "high" },
    {
      q: "Business bank account details (bank, branch code, account number)?",
      cat: "🏢 Business",
      p: "high",
    },
    { q: "Director/owner names and ID numbers (for CIPC records)?", cat: "🏢 Business", p: "high" },
    { q: "Accountant name, firm, and contact details?", cat: "🏢 Business", p: "high" },
    { q: "Business attorney or conveyancer contact?", cat: "🏢 Business", p: "medium" },

    // ─── LICENCES & COMPLIANCE ───
    { q: "Liquor licence number and renewal date?", cat: "📋 Licences", p: "high" },
    { q: "Business licence number and expiry date?", cat: "📋 Licences", p: "high" },
    {
      q: "Certificate of Acceptability (food health cert) number and renewal date?",
      cat: "📋 Licences",
      p: "high",
    },
    { q: "Fire compliance certificate number and expiry?", cat: "📋 Licences", p: "high" },
    { q: "Health and safety compliance status?", cat: "📋 Licences", p: "medium" },
    { q: "POPIA compliance officer name and contact?", cat: "📋 Licences", p: "medium" },
    { q: "UIF registration number?", cat: "📋 Licences", p: "high" },
    { q: "SARS PAYE reference number?", cat: "📋 Licences", p: "high" },
    { q: "Workers' compensation / COIDA registration number?", cat: "📋 Licences", p: "high" },

    // ─── SUPPLIERS ───
    {
      q: "Primary stock or raw material supplier — name, rep, account number?",
      cat: "📦 Suppliers",
      p: "high",
    },
    { q: "Secondary or backup supplier — name and contact?", cat: "📦 Suppliers", p: "high" },
    {
      q: "Consumables supplier (packaging, cleaning, office) — account number?",
      cat: "📦 Suppliers",
      p: "high",
    },
    {
      q: "Utilities supplier — electricity, gas, water — account numbers?",
      cat: "📦 Suppliers",
      p: "high",
    },
    { q: "Uniforms or workwear supplier?", cat: "📦 Suppliers", p: "low" },
    { q: "POS or billing system provider and support number?", cat: "📦 Suppliers", p: "high" },
    { q: "Payment terminal provider and support number?", cat: "📦 Suppliers", p: "high" },
    {
      q: "Internet/Wi-Fi provider and support number for the business?",
      cat: "📦 Suppliers",
      p: "high",
    },
    { q: "Payment terms with each major supplier?", cat: "📦 Suppliers", p: "high" },
    {
      q: "Which suppliers offer credit and what are the limits?",
      cat: "📦 Suppliers",
      p: "medium",
    },

    // ─── STAFF ───
    {
      q: "Full-time staff list — names, roles, ID numbers, cell numbers?",
      cat: "👥 Staff",
      p: "high",
    },
    { q: "Part-time staff list — names, availability, cell numbers?", cat: "👥 Staff", p: "high" },
    { q: "Payroll frequency and method — weekly/monthly, EFT/cash?", cat: "👥 Staff", p: "high" },
    { q: "Payday — which day of the week or month?", cat: "👥 Staff", p: "high" },
    { q: "Shift schedule — opening, mid, closing?", cat: "👥 Staff", p: "medium" },
    { q: "Who is responsible for banking daily takings?", cat: "👥 Staff", p: "high" },
    { q: "Who has keys to the premises?", cat: "👥 Staff", p: "high" },
    { q: "Emergency contact for each staff member?", cat: "👥 Staff", p: "medium" },
    { q: "Any staff contracts in place — where are they stored?", cat: "👥 Staff", p: "high" },

    // ─── EQUIPMENT ───
    {
      q: "Commercial fridge/freezer — make, model, supplier, warranty expiry?",
      cat: "⚙️ Equipment",
      p: "high",
    },
    { q: "Grill / flat top — make, model, service contact?", cat: "⚙️ Equipment", p: "high" },
    { q: "Deep fryer — make, model, last service date?", cat: "⚙️ Equipment", p: "medium" },
    {
      q: "Fire extinguishers — how many, last inspection date, next due?",
      cat: "⚙️ Equipment",
      p: "high",
    },
    {
      q: "Hood / extraction fan — last cleaning date, service contact?",
      cat: "⚙️ Equipment",
      p: "high",
    },
    { q: "POS hardware — serial numbers and warranty info?", cat: "⚙️ Equipment", p: "medium" },
    {
      q: "CCTV system — provider, recording retention, remote access setup?",
      cat: "⚙️ Equipment",
      p: "medium",
    },

    // ─── SOPs & PROCESSES ───
    { q: "Core product or service delivery process — step by step?", cat: "📖 SOPs", p: "high" },
    {
      q: "Opening / start-of-day checklist — what must be done before operations begin?",
      cat: "📖 SOPs",
      p: "high",
    },
    {
      q: "Closing / end-of-day checklist — what must be done before locking up?",
      cat: "📖 SOPs",
      p: "high",
    },
    {
      q: "Daily cash-up or reconciliation procedure — steps and who is responsible?",
      cat: "📖 SOPs",
      p: "high",
    },
    { q: "Quality control process — how is it checked and by whom?", cat: "📖 SOPs", p: "medium" },
    { q: "Stock take process — how often and who does it?", cat: "📖 SOPs", p: "medium" },
    { q: "Waste or returns tracking process?", cat: "📖 SOPs", p: "low" },

    // ─── COSTS & MARGINS ───
    { q: "Target food cost percentage?", cat: "💰 Costs", p: "high" },
    { q: "Average spend per customer (ATP)?", cat: "💰 Costs", p: "high" },
    { q: "Monthly fixed costs — rent, salaries, utilities total?", cat: "💰 Costs", p: "high" },
    { q: "Break-even daily sales target?", cat: "💰 Costs", p: "high" },
    { q: "Best-selling items and their GP margins?", cat: "💰 Costs", p: "medium" },

    // ─── MARKETING ───
    {
      q: "Google Business profile — email it's registered under, last updated?",
      cat: "📣 Marketing",
      p: "high",
    },
    { q: "Facebook page — admin email, URL?", cat: "📣 Marketing", p: "high" },
    { q: "Instagram account handle and admin email?", cat: "📣 Marketing", p: "high" },
    {
      q: "Online marketplace or delivery platform accounts — details and commission rates?",
      cat: "📣 Marketing",
      p: "high",
    },
    {
      q: "Loyalty program — how does it work and what platform?",
      cat: "📣 Marketing",
      p: "medium",
    },
    { q: "Who creates content / social media posts?", cat: "📣 Marketing", p: "low" },

    // ─── INSURANCE ───
    { q: "Business insurance broker name and contact?", cat: "📋 Insurance", p: "high" },
    {
      q: "Contents insurance — provider, policy number, what's covered?",
      cat: "📋 Insurance",
      p: "high",
    },
    {
      q: "Business interruption insurance — provider and what triggers it?",
      cat: "📋 Insurance",
      p: "high",
    },
    {
      q: "Public liability insurance — policy number and cover amount?",
      cat: "📋 Insurance",
      p: "high",
    },
    { q: "Employer's liability insurance in place?", cat: "📋 Insurance", p: "high" },
  ] as Suggestion[]
).sort((a, b) => {
  const w: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return (w[b.p] || 0) - (w[a.p] || 0) + (Math.random() - 0.5) * 0.5;
});
