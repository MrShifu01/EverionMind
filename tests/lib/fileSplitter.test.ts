import { describe, it, expect } from "vitest";
import {
  shouldSplitContent,
  parseAISplitResponse,
  buildSplitPrompt,
} from "../../src/lib/fileSplitter";

describe("fileSplitter", () => {
  describe("shouldSplitContent", () => {
    it("returns true for long content with multiple sections", () => {
      const longContent = `
Company Registration Details:
- Company Name: Smash Burger Bar
- CIPC Number: 2024/123456/07
- Tax Number: 9876543210

Directors:
- John Smith (ID: 8501015800084)
- Jane Doe (ID: 9002024800088)

Registered Address:
123 Main Street, Cape Town, 8001
      `.trim();
      expect(shouldSplitContent(longContent)).toBe(true);
    });

    it("returns false for short single-topic content", () => {
      expect(shouldSplitContent("Buy milk from the shop")).toBe(false);
    });

    it("returns false for empty content", () => {
      expect(shouldSplitContent("")).toBe(false);
    });

    it("returns true for content with multiple recipes", () => {
      const recipes = `
Recipe 1: Chocolate Cake
Ingredients: flour, sugar, cocoa, eggs, butter
Instructions: Mix dry ingredients. Add wet. Bake at 180C for 30 min.

Recipe 2: Banana Bread
Ingredients: bananas, flour, sugar, eggs
Instructions: Mash bananas. Mix with other ingredients. Bake at 160C for 45 min.

Recipe 3: Pancakes
Ingredients: flour, milk, eggs, butter
Instructions: Mix until smooth. Cook on pan.
      `.trim();
      expect(shouldSplitContent(recipes)).toBe(true);
    });
  });

  describe("buildSplitPrompt", () => {
    it("returns a string containing the file content", () => {
      const prompt = buildSplitPrompt("Some content here", "business");
      expect(prompt).toContain("Some content here");
    });

    it("includes brain type context", () => {
      const prompt = buildSplitPrompt("content", "business");
      expect(prompt).toContain("business");
    });
  });

  describe("parseAISplitResponse", () => {
    it("parses valid JSON array of entries", () => {
      const response = JSON.stringify([
        {
          title: "CIPC Number",
          content: "2024/123456/07",
          type: "document",
          metadata: {},
          tags: ["cipc"],
        },
        {
          title: "Tax Number",
          content: "9876543210",
          type: "document",
          metadata: {},
          tags: ["tax"],
        },
      ]);
      const entries = parseAISplitResponse(response);
      expect(entries).toHaveLength(2);
      expect(entries[0].title).toBe("CIPC Number");
      expect(entries[1].title).toBe("Tax Number");
    });

    it("handles markdown-wrapped JSON", () => {
      const response =
        '```json\n[{"title":"Test","content":"data","type":"note","metadata":{},"tags":[]}]\n```';
      const entries = parseAISplitResponse(response);
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe("Test");
    });

    it("returns empty array for invalid JSON", () => {
      expect(parseAISplitResponse("not json")).toEqual([]);
    });

    it("returns empty array for non-array JSON", () => {
      expect(parseAISplitResponse('{"title":"test"}')).toEqual([]);
    });

    it("filters out entries without title", () => {
      const response = JSON.stringify([
        { title: "Good Entry", content: "data", type: "note" },
        { content: "no title", type: "note" },
      ]);
      const entries = parseAISplitResponse(response);
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe("Good Entry");
    });

    it("normalises AI-invented types to valid capture types", () => {
      // AI may return types like "company", "director", "address" for company docs
      const response = JSON.stringify([
        { title: "SMASH SOCIAL CLUB", content: "Private company", type: "company" },
        { title: "Adriaan Stander", content: "Director", type: "director" },
        { title: "Registered Address", content: "123 Main St", type: "address" },
        { title: "CIPC Number", content: "2024/123456/07", type: "document" },
      ]);
      const entries = parseAISplitResponse(response);
      const VALID_TYPES = ["note","person","place","idea","contact","document","reminder","color","decision","secret"];
      entries.forEach((e) => {
        expect(VALID_TYPES).toContain(e.type);
      });
    });
  });
});
