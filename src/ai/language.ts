// Foydalanuvchi qaysi tilda va qaysi yozuvda yozganini taxmin qiladi.
// Bu faqat AI uchun ISHORA — yakuniy qarorni model qiladi.
export type Language = "uz-latn" | "uz-cyrl" | "ru" | "en";

const UZ_CYRILLIC_LETTERS = /[ўқғҳ]/i;
const UZ_CYRILLIC_WORDS = new Set([
  "салом", "ассалому", "алейкум", "рахмат", "раҳмат", "яхши", "нима", "қалесан", "калесан",
  "йўқ", "йук", "бугун", "эртага", "керак", "қаерда", "каерда", "мен", "сен", "сиз", "ҳа", "хоп",
]);

const UZ_LATIN_WORDS = new Set([
  "salom", "assalomu", "alaykum", "rahmat", "yaxshi", "nima", "qalesan", "qayerda", "bugun",
  "ertaga", "kerak", "xop", "bopti", "zor", "hozir", "keyin", "men", "sen", "siz", "ha", "yoq",
  "qanday", "nega", "qachon", "iltimos", "uka", "aka", "opa", "bormi", "yoqmi",
]);
const UZ_LATIN_SUFFIXES = /(misan|misiz|mizmi|yapsan|yapman|yapti|yapmiz|yapsiz|asizmi|ganman|dingmi|amizmi|amanmi)$/;

// o' va g' — tutuq belgisining barcha variantlari bilan. "o'clock" va "dog's" kabi
// inglizcha holatlar kirmaydi.
const APOSTROPHES = "'ʻ’‘`";
const UZ_OG = new RegExp(`[og][${APOSTROPHES}](?!s\\b|clock)[a-z]`, "i");

export function detectLanguage(text: string): Language | null {
  const lower = text.toLowerCase();
  const cyrillic = (lower.match(/[Ѐ-ӿ]/g) ?? []).length;
  const latin = (lower.match(/[a-z]/g) ?? []).length;
  if (cyrillic === 0 && latin === 0) return null; // faqat emoji yoki raqam

  if (cyrillic > latin) {
    if (UZ_CYRILLIC_LETTERS.test(lower)) return "uz-cyrl";
    const words = lower.match(/[Ѐ-ӿ]+/g) ?? [];
    return words.some((w) => UZ_CYRILLIC_WORDS.has(w)) ? "uz-cyrl" : "ru";
  }

  if (UZ_OG.test(lower)) return "uz-latn";
  const words = lower.replace(new RegExp(`[${APOSTROPHES}]`, "g"), "").match(/[a-z]+/g) ?? [];
  if (words.some((w) => UZ_LATIN_WORDS.has(w) || UZ_LATIN_SUFFIXES.test(w))) return "uz-latn";
  return "en";
}

export const LANGUAGE_NAMES: Record<Language, string> = {
  "uz-latn": "Uzbek, Latin script",
  "uz-cyrl": "Uzbek, Cyrillic script",
  ru: "Russian",
  en: "English",
};
