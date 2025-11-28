import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { returnError } from "@/server/validation/http";
import { PDFDocument, StandardFonts } from "pdf-lib";

const sectionSchema = z.object({
  heading: z.string().min(1, "Section heading cannot be empty"),
  body: z.string().min(1, "Section body cannot be empty"),
});

const conversationSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const requestSchema = z.object({
  title: z.string().optional().transform((value) => value?.trim() || null),
  summary: z.string().optional().transform((value) => value?.trim() || null),
  bullets: z.array(z.string()).optional(),
  sections: z.array(sectionSchema).optional(),
  conversation: z.array(conversationSchema).optional(),
  footer: z.string().optional().transform((value) => value?.trim() || null),
  downloadName: z.string().optional().transform((value) => value?.trim() || null),
});

function sanitizeFilename(value: string | null | undefined): string {
  const fallback = "composer.pdf";
  if (!value) return fallback;
  const safe = value.replace(/[^\w.-]+/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe || "composer"}.pdf`;
}

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to generate a PDF.");
  }

  let parsed;
  try {
    const payload = await req.json();
    parsed = requestSchema.safeParse(payload);
  } catch (error) {
    console.warn("pdf request body parse failed", error);
    return returnError(400, "invalid_payload", "Could not read the PDF request.");
  }

  if (!parsed.success) {
    return returnError(400, "invalid_payload", parsed.error.message);
  }

  const { title, summary, bullets = [], sections = [], conversation = [], footer, downloadName } =
    parsed.data;

  if (!summary && !sections.length && !bullets.length && !conversation.length) {
    return returnError(
      400,
      "invalid_payload",
      "Provide some content (summary, sections, bullets, or conversation) to generate a PDF.",
    );
  }

  const pdfDoc = await PDFDocument.create();
  const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage();
  let cursorY = page.getSize().height - 60;
  const marginX = 50;
  const maxWidth = page.getSize().width - marginX * 2;

  const drawTextBlock = (
    text: string,
    options: { font?: typeof normalFont; fontSize?: number; gapAbove?: number; gapBelow?: number } = {},
  ) => {
    const font = options.font ?? normalFont;
    const fontSize = options.fontSize ?? 12;
    const gapAbove = options.gapAbove ?? 0;
    const gapBelow = options.gapBelow ?? 10;
    if (!text.trim().length) return;
    cursorY -= gapAbove;

    const words = text.split(/\s+/);
    let line = "";
    const lines: string[] = [];
    words.forEach((word) => {
      const tentative = line.length ? `${line} ${word}` : word;
      const w = font.widthOfTextAtSize(tentative, fontSize);
      if (w <= maxWidth) {
        line = tentative;
      } else {
        if (line.length) lines.push(line);
        line = word;
      }
    });
    if (line.length) lines.push(line);

    lines.forEach((l) => {
      if (cursorY < 80) {
        page = pdfDoc.addPage();
        cursorY = page.getSize().height - 60;
      }
      page.drawText(l, { x: marginX, y: cursorY, size: fontSize, font });
      cursorY -= fontSize * 1.3;
    });
    cursorY -= gapBelow;
  };

  if (title) {
    drawTextBlock(title, { font: boldFont, fontSize: 20, gapBelow: 14 });
  }

  if (summary) {
    drawTextBlock(summary, { font: normalFont, fontSize: 13 });
  }

  if (bullets.length) {
    bullets.forEach((bullet) => drawTextBlock(`• ${bullet}`, { fontSize: 12, gapBelow: 6, gapAbove: 2 }));
  }

  if (sections.length) {
    sections.forEach((section) => {
      drawTextBlock(section.heading, { font: boldFont, fontSize: 14, gapAbove: 8, gapBelow: 4 });
      drawTextBlock(section.body, { font: normalFont, fontSize: 12 });
    });
  }

  if (conversation.length) {
    page = pdfDoc.addPage();
    cursorY = page.getSize().height - 60;
    drawTextBlock("Conversation", { font: boldFont, fontSize: 14, gapBelow: 10 });
    conversation.forEach((entry) => {
      drawTextBlock(`${entry.role === "assistant" ? "Assistant" : "You"}:`, {
        font: boldFont,
        fontSize: 12,
        gapBelow: 4,
      });
      drawTextBlock(entry.content, { font: normalFont, fontSize: 11, gapBelow: 8 });
    });
  }

  if (footer) {
    drawTextBlock(footer, { font: normalFont, fontSize: 11, gapAbove: 12 });
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const filename = sanitizeFilename(downloadName ?? title ?? "composer.pdf");
  const pdfBlob = new Blob([pdfBuffer], { type: "application/pdf" });

  return new Response(pdfBlob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}

export const runtime = "nodejs";
