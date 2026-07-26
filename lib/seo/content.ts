import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";

/**
 * Rotating unique-content blocks + auto-answered FAQs (Doc3 §4).
 *
 * Two rules make this safe rather than spammy:
 *
 *  1. VARIANT SELECTION IS DETERMINISTIC PER URL. A hash of the path picks the
 *     template, so /flats-for-sale-in-mavdi-rajkot always reads the same but
 *     /plots-for-sale-in-mavdi-rajkot reads differently. Random rotation would
 *     serve Googlebot different text on every crawl, which looks like cloaking.
 *
 *  2. A TEMPLATE WHOSE PLACEHOLDERS CANNOT BE FILLED IS SKIPPED. Every
 *     placeholder resolves to a MEASURED value; if a page has no price data,
 *     the templates that mention price are not eligible, and an FAQ that would
 *     render "the average is null" is dropped instead. Thin/blank FAQ answers
 *     are worse than fewer FAQs.
 */

const db = () => createServiceClient();

export interface Faq { question: string; answer: string }

type Vars = Record<string, string | null>;

const PLACEHOLDER = /\{([a-zA-Z]+)\}/g;

/** All placeholders a template needs. */
function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

/** Fill, or return null if any placeholder has no measured value. */
function fill(text: string, vars: Vars): string | null {
  let missing = false;
  const out = text.replace(PLACEHOLDER, (_m, key: string) => {
    const v = vars[key];
    if (v == null || v === "") { missing = true; return ""; }
    return v;
  });
  return missing ? null : out;
}

/** Stable 0..n-1 choice from the URL — same page, same text, every crawl. */
function pick<T>(items: T[], seed: string): T | null {
  if (!items.length) return null;
  const h = createHash("sha1").update(seed).digest();
  return items[h[0] % items.length];
}

interface TemplateRow { variant: number; body: string }

export async function renderIntro(
  pageKind: "landing" | "area" | "city",
  path: string,
  vars: Vars,
): Promise<string | null> {
  const { data } = await db()
    .from("seo_content_templates")
    .select("variant,body")
    .eq("slot", "intro")
    .eq("page_kind", pageKind)
    .eq("is_active", true)
    .order("variant");

  const rows = ((data ?? []) as TemplateRow[]);
  // Only templates every placeholder of which we can fill are eligible.
  const eligible = rows.filter((r) => placeholdersOf(r.body).every((k) => vars[k] != null && vars[k] !== ""));
  const chosen = pick(eligible, path);
  return chosen ? fill(chosen.body, vars) : null;
}

export async function renderFaqs(
  pageKind: "landing" | "area" | "city",
  vars: Vars,
): Promise<Faq[]> {
  const { data } = await db()
    .from("seo_faq_templates")
    .select("question,answer,requires,sort_order")
    .eq("page_kind", pageKind)
    .eq("is_active", true)
    .order("sort_order");

  const out: Faq[] = [];
  for (const r of ((data ?? []) as { question: string; answer: string; requires: string[] }[])) {
    // `requires` is belt-and-braces on top of the placeholder scan: it lets an
    // editor mark an FAQ as needing a value that appears only indirectly.
    const needed = [...placeholdersOf(r.question), ...placeholdersOf(r.answer), ...(r.requires ?? [])];
    if (needed.some((k) => vars[k] == null || vars[k] === "")) continue;
    const q = fill(r.question, vars);
    const a = fill(r.answer, vars);
    if (q && a) out.push({ question: q, answer: a });
  }
  return out;
}
