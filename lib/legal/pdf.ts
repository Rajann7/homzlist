import "server-only";
import { bodyToText } from "./markdown";

/**
 * A minimal, dependency-free PDF writer for the legal readers' "Download PDF".
 *
 * P12 puts a Download-PDF button on every legal document, so the button has to
 * produce a real PDF — not an HTML file with a .pdf name. This emits a valid
 * PDF 1.4 with the base-14 Helvetica fonts (no font embedding needed), one
 * content stream per page, wrapping text at a fixed measure.
 *
 * Scope is deliberately small: headings, paragraphs and bullets, which is all a
 * legal document is. If richer output is ever needed, this is the seam to
 * replace with a real library.
 */

const PAGE_W = 595.28; // A4 @ 72dpi
const PAGE_H = 841.89;
const MARGIN = 56;
const MEASURE = PAGE_W - MARGIN * 2;

// Helvetica advance widths (per 1000 units) for the printable ASCII range.
// prettier-ignore
const WIDTHS: Record<string, number> = (() => {
  const w: Record<string, number> = {};
  const groups: Array<[string, number]> = [
    [" !", 278], ['"', 355], ["#$", 556], ["%", 889], ["&", 667], ["'", 191],
    ["()", 333], ["*", 389], ["+", 584], [",", 278], ["-", 333], [".", 278], ["/", 278],
    ["0123456789", 556], [":;", 278], ["<=>", 584], ["?", 556], ["@", 1015],
    ["ABDEHKNPQRUVXY", 722], ["C", 722], ["FG", 700], ["I", 278], ["J", 500],
    ["LSTZ", 611], ["MW", 900], ["O", 778], ["[]", 278], ["\\", 278], ["^", 469], ["_", 556],
    ["`", 333], ["abcdeghknopqsuvxyz", 556], ["f", 278], ["i", 222], ["j", 222],
    ["l", 222], ["m", 833], ["r", 333], ["t", 278], ["w", 722],
    ["{}", 334], ["|", 260], ["~", 584],
  ];
  for (const [chars, width] of groups) for (const c of chars) w[c] = width;
  return w;
})();

const widthOf = (text: string, size: number, bold: boolean) => {
  let total = 0;
  for (const c of text) total += (WIDTHS[c] ?? 556) * (bold ? 1.06 : 1);
  return (total / 1000) * size;
};

/** Latin-1 with the few typographic characters our copy uses folded down. */
const toLatin1 = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/₹/g, "Rs. ")
    .replace(/[^\x20-\x7E]/g, "");

const escapePdf = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

function wrap(text: string, size: number, bold: boolean, indent = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const max = MEASURE - indent;
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (widthOf(next, size, bold) > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

interface Op { text: string; size: number; bold: boolean; gap: number; indent: number }

function layout(title: string, subtitle: string, body: string): Op[] {
  const ops: Op[] = [
    { text: title, size: 20, bold: true, gap: 8, indent: 0 },
    { text: subtitle, size: 9, bold: false, gap: 18, indent: 0 },
  ];
  for (const raw of bodyToText(body).split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    const head = /^##\s+(.+)$/.exec(t);
    if (head) { ops.push({ text: head[1], size: 13, bold: true, gap: 6, indent: 0 }); continue; }
    const bullet = /^[-*]\s+(.+)$/.exec(t);
    if (bullet) { ops.push({ text: `• ${bullet[1]}`, size: 10, bold: false, gap: 4, indent: 14 }); continue; }
    const num = /^(\d+\.)\s+(.+)$/.exec(t);
    if (num) { ops.push({ text: `${num[1]} ${num[2]}`, size: 10, bold: false, gap: 4, indent: 14 }); continue; }
    ops.push({ text: t, size: 10, bold: false, gap: 8, indent: 0 });
  }
  return ops;
}

/** Build the PDF bytes for one legal document. */
export function renderLegalPdf(opts: {
  title: string;
  version: string;
  effectiveDate: string;
  body: string;
  footer: string;
}): Buffer {
  const ops = layout(
    toLatin1(opts.title),
    toLatin1(`Version ${opts.version} · Effective ${opts.effectiveDate}`.replace("·", "-")),
    opts.body,
  );

  // ---- flow into pages
  const pages: string[][] = [];
  let stream: string[] = [];
  let y = PAGE_H - MARGIN;
  const newPage = () => { pages.push(stream); stream = []; y = PAGE_H - MARGIN; };

  for (const op of ops) {
    const leading = op.size * 1.45;
    for (const line of wrap(toLatin1(op.text), op.size, op.bold, op.indent)) {
      if (y - leading < MARGIN + 24) newPage();
      y -= leading;
      stream.push(
        `BT /${op.bold ? "F2" : "F1"} ${op.size} Tf ${MARGIN + op.indent} ${y.toFixed(2)} Td (${escapePdf(line)}) Tj ET`,
      );
    }
    y -= op.gap;
  }
  pages.push(stream);

  // page footers
  const footer = toLatin1(opts.footer);
  pages.forEach((p, i) => {
    p.push(
      `BT /F1 8 Tf ${MARGIN} ${MARGIN - 16} Td 0.55 0.55 0.55 rg (${escapePdf(footer)}) Tj ET`,
      `BT /F1 8 Tf ${PAGE_W - MARGIN - 40} ${MARGIN - 16} Td 0.55 0.55 0.55 rg (${escapePdf(`Page ${i + 1} of ${pages.length}`)}) Tj ET`,
    );
  });

  // ---- assemble objects
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };

  const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  // /Pages is written after the page objects; its number is known up front:
  // the two fonts, then a content + page object per page, then /Pages itself.
  const pagesObjNo = objects.length + pages.length * 2 + 1;

  const kids: number[] = [];
  for (const p of pages) {
    const content = p.join("\n");
    const contentNo = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    const pageNo = add(
      `<< /Type /Page /Parent ${pagesObjNo} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentNo} 0 R >>`,
    );
    kids.push(pageNo);
  }
  const pagesNo = add(`<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] >>`);
  const catalogNo = add(`<< /Type /Catalog /Pages ${pagesNo} 0 R >>`);
  const infoNo = add(
    `<< /Title (${escapePdf(toLatin1(opts.title))}) /Producer (HomzList) /Creator (HomzList) >>`,
  );

  // ---- serialise with an xref table
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNo} 0 R /Info ${infoNo} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;

  return Buffer.from(out, "latin1");
}
