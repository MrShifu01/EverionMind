export const AI_MEMORY_PROMPT = `Review all the memories, preferences, and personal facts you have saved about me. Export them as a JSON array — one object per memory — in this exact format:

[
  {
    "title": "Short descriptive title (max 60 characters)",
    "content": "Full detail and context — be thorough, don't truncate",
    "type": "note | person | task | event | health | finance | reminder | contact | place | idea | decision | document | other",
    "tags": ["tag1", "tag2"],
    "metadata": {
      "workspace": "personal | business | both",
      "date": "YYYY-MM-DD if relevant",
      "phone": "if relevant",
      "email": "if relevant",
      "url": "if relevant"
    }
  }
]

Rules:
- One distinct memory = one object. Never merge unrelated things.
- Use the most specific type. "note" is the fallback.
- Tags: 1–4 lowercase keywords.
- Omit metadata keys that don't apply — no null values.
- Output ONLY the raw JSON array. No markdown, no explanation. Start with [ and end with ].`;
