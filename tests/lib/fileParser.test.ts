import { describe, it, expect } from "vitest";
import {
  isSupportedFile,
  isTextFile,
  readTextFile,
  readFileAsBase64,
  getFileExtension,
  SUPPORTED_EXTENSIONS,
} from "../../src/lib/fileParser";

/* ── Helper: create a mock File ── */
function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type });
}

function makeBinaryFile(name: string, bytes: Uint8Array, type: string): File {
  return new File([bytes.buffer as ArrayBuffer], name, { type });
}

describe("fileParser", () => {
  describe("SUPPORTED_EXTENSIONS", () => {
    it("includes txt, md, csv, pdf, docx", () => {
      expect(SUPPORTED_EXTENSIONS).toContain(".txt");
      expect(SUPPORTED_EXTENSIONS).toContain(".md");
      expect(SUPPORTED_EXTENSIONS).toContain(".csv");
      expect(SUPPORTED_EXTENSIONS).toContain(".pdf");
      expect(SUPPORTED_EXTENSIONS).toContain(".docx");
    });
  });

  describe("getFileExtension", () => {
    it("extracts extension from filename", () => {
      expect(getFileExtension("report.pdf")).toBe(".pdf");
      expect(getFileExtension("notes.md")).toBe(".md");
      expect(getFileExtension("data.CSV")).toBe(".csv");
      expect(getFileExtension("My Document.DOCX")).toBe(".docx");
    });

    it("returns empty string for no extension", () => {
      expect(getFileExtension("README")).toBe("");
    });
  });

  describe("isSupportedFile", () => {
    it("returns true for supported text files", () => {
      expect(isSupportedFile(makeFile("notes.txt", "hello", "text/plain"))).toBe(true);
      expect(isSupportedFile(makeFile("readme.md", "# Hi", "text/markdown"))).toBe(true);
      expect(isSupportedFile(makeFile("data.csv", "a,b", "text/csv"))).toBe(true);
    });

    it("returns true for PDF files", () => {
      expect(isSupportedFile(makeFile("doc.pdf", "", "application/pdf"))).toBe(true);
    });

    it("returns true for DOCX files", () => {
      expect(
        isSupportedFile(
          makeFile(
            "report.docx",
            "",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ),
        ),
      ).toBe(true);
    });

    it("returns false for unsupported files", () => {
      expect(isSupportedFile(makeFile("photo.jpg", "", "image/jpeg"))).toBe(false);
      expect(isSupportedFile(makeFile("video.mp4", "", "video/mp4"))).toBe(false);
      expect(isSupportedFile(makeFile("app.exe", "", "application/octet-stream"))).toBe(false);
    });
  });

  describe("isTextFile", () => {
    it("returns true for plain text files", () => {
      expect(isTextFile(makeFile("notes.txt", "hello", "text/plain"))).toBe(true);
      expect(isTextFile(makeFile("readme.md", "# Hi", "text/markdown"))).toBe(true);
      expect(isTextFile(makeFile("data.csv", "a,b", "text/csv"))).toBe(true);
    });

    it("returns false for binary files", () => {
      expect(isTextFile(makeFile("doc.pdf", "", "application/pdf"))).toBe(false);
      expect(
        isTextFile(
          makeFile(
            "report.docx",
            "",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ),
        ),
      ).toBe(false);
    });
  });

  describe("readTextFile", () => {
    it("reads a text file and returns its content", async () => {
      const file = makeFile("notes.txt", "Hello World", "text/plain");
      const content = await readTextFile(file);
      expect(content).toBe("Hello World");
    });

    it("reads a markdown file", async () => {
      const file = makeFile("readme.md", "# Title\n\nSome content", "text/markdown");
      const content = await readTextFile(file);
      expect(content).toBe("# Title\n\nSome content");
    });

    it("reads a CSV file", async () => {
      const file = makeFile("data.csv", "name,age\nJohn,30", "text/csv");
      const content = await readTextFile(file);
      expect(content).toBe("name,age\nJohn,30");
    });
  });

  describe("readFileAsBase64", () => {
    it("returns base64 string and mime type for a file", async () => {
      const file = makeFile("test.pdf", "fake pdf content", "application/pdf");
      const result = await readFileAsBase64(file);
      expect(result).toHaveProperty("base64");
      expect(result).toHaveProperty("mimeType", "application/pdf");
      expect(typeof result.base64).toBe("string");
      expect(result.base64.length).toBeGreaterThan(0);
    });

    it("returns base64 for a binary file", async () => {
      const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // zip magic bytes
      const file = makeBinaryFile(
        "doc.docx",
        bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      const result = await readFileAsBase64(file);
      expect(result.base64.length).toBeGreaterThan(0);
      expect(result.mimeType).toContain("wordprocessingml");
    });
  });
});
