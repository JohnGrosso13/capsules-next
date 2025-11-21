import PDFDocument from "pdfkit";
import type PDFKit from "pdfkit";
import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { returnError } from "@/server/validation/http";

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

function addBullets(doc: PDFKit.PDFDocument, bullets: string[]) {
  if (!bullets.length) return;
  doc.moveDown(0.5);
  for (const bullet of bullets) {
    const text = bullet.trim();
    if (!text.length) continue;
    doc.text(`- ${text}`);
  }
}

function addSections(
  doc: PDFKit.PDFDocument,
  sections: Array<{ heading: string; body: string }>,
) {
  sections.forEach((section, index) => {
    doc.moveDown(1);
    doc.fontSize(14).text(section.heading, { underline: true });
    doc.moveDown(0.35);
    doc.fontSize(12).text(section.body);
    if (index < sections.length - 1) {
      doc.moveDown(0.5);
    }
  });
}

function addConversation(
  doc: PDFKit.PDFDocument,
  entries: Array<{ role: string; content: string }>,
) {
  if (!entries.length) return;
  doc.addPage();
  doc.fontSize(14).text("Conversation", { underline: true });
  doc.moveDown(0.5);
  entries.forEach((entry) => {
    const label = entry.role === "assistant" ? "Assistant" : "You";
    doc.fontSize(11).text(`${label}:`, { continued: false, underline: false });
    doc.moveDown(0.15);
    doc.fontSize(11).text(entry.content, { indent: 10 });
    doc.moveDown(0.5);
  });
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

  const doc = new PDFDocument({ margin: 50, size: "LETTER", info: { Title: title ?? "Composer PDF" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

  const pdfBufferPromise = new Promise<Buffer>((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });

  if (title) {
    doc.fontSize(20).text(title, { align: "left" });
    doc.moveDown(0.75);
  }

  if (summary) {
    doc.fontSize(13).text(summary);
    doc.moveDown(0.75);
  }

  addBullets(doc, bullets);

  if (sections.length) {
    addSections(
      doc,
      sections.map((entry) => ({
        heading: entry.heading,
        body: entry.body,
      })),
    );
  }

  if (conversation.length) {
    addConversation(doc, conversation);
  }

  if (footer) {
    doc.moveDown(1);
    doc.fontSize(11).text(footer, { align: "left" });
  }

  doc.end();

  const pdfBuffer = await pdfBufferPromise;
  const filename = sanitizeFilename(downloadName ?? title ?? "composer.pdf");
  const pdfBytes = Uint8Array.from(pdfBuffer);
  const pdfBlob = new Blob([pdfBytes.buffer], { type: "application/pdf" });

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
