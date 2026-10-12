import { describe, expect, it } from "vitest";
import { detectLanguage } from "../src/ai/language.js";

describe("detectLanguage", () => {
  it.each([
    ["Salom, qalesan?", "uz-latn"],
    ["Bugun bo'shmisan?", "uz-latn"],
    ["Bugun boʻshmisan?", "uz-latn"],
    ["Uchrashamizmi", "uz-latn"],
    ["Nima qilyapsan", "uz-latn"],
    ["Салом, яхшимисиз?", "uz-cyrl"],
    ["Қаердасан?", "uz-cyrl"],
    ["Привет, как дела?", "ru"],
    ["Hi, are you free tonight?", "en"],
    ["It's my dog's ball, see you at 5 o'clock", "en"],
    ["Ok", "en"],
    ["👍", null],
    ["12345", null],
  ] as const)("%s → %s", (text, expected) => {
    expect(detectLanguage(text)).toBe(expected);
  });
});
