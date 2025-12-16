// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductMockup } from "../ProductMockup";
import type { ProductPreviewModel } from "../types";
import type { ProductTemplate } from "../templates";

const basePreview: ProductPreviewModel = {
  title: "Demo",
  summary: "Summary",
  price: 10,
  currency: "usd",
  imageUrl: "design.png",
  templateLabel: "Tee",
  templateId: "tee",
  capsuleName: "Capsule",
  colors: ["Black"],
  primaryColor: "Black",
  sizes: ["M"],
  featured: true,
  publish: true,
  placementScale: 1,
  placementOffsetX: 0,
  placementOffsetY: 0,
};

const baseTemplate: ProductTemplate = {
  id: "tee",
  label: "Tee",
  categoryId: "apparel",
  categoryLabel: "Apparel",
  mockup: {
    aspectRatio: 1,
    printArea: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    backgroundKind: "tee",
    baseImage: "/mockups/tee/black.png",
    colorImages: {
      Black: "/mockups/tee/black.png",
      White: "/mockups/tee/white.png",
    },
  },
};

describe("ProductMockup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders base image for matching color", () => {
    render(
      <ProductMockup
        imageUrl={basePreview.imageUrl}
        template={baseTemplate}
        preview={basePreview}
        selectedColor="Black"
      />,
    );
    const baseImg = screen.getByAltText(/base mockup/i) as HTMLImageElement;
    expect(baseImg).toBeInTheDocument();
    expect(baseImg.src).toContain("/mockups/tee/black.png");
  });

  it("shows empty state when no design image", () => {
    render(
      <ProductMockup
        imageUrl={null}
        template={baseTemplate}
        preview={basePreview}
        selectedColor="Black"
      />,
    );
    expect(screen.getByText(/no design linked yet/i)).toBeInTheDocument();
  });

  it("applies mask data attribute when maskSvgUrl is provided", () => {
    const templateWithMask: ProductTemplate = {
      ...baseTemplate,
      mockup: {
        ...baseTemplate.mockup!,
        maskSvgUrl: "/mockups/mug/mask.svg",
      },
    };

    render(
      <ProductMockup
        imageUrl={basePreview.imageUrl}
        template={templateWithMask}
        preview={basePreview}
        selectedColor="Black"
      />,
    );

    const printArea = screen.getByLabelText(/design placement preview/i);
    expect(printArea.getAttribute("data-mask")).toBe("true");
  });

  it("renders Printful mockup when remote mockups are returned", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          mockups: [
            { url: "https://mock.printful/front.png", position: "front", variantIds: [4012] },
          ],
        }),
      } as unknown as Response);

    const templateWithPrintful: ProductTemplate = {
      ...baseTemplate,
      mockup: {
        ...baseTemplate.mockup!,
        printful: {
          productId: 1234,
          placement: "front",
          variantIdsByColor: { Black: 4012 },
        },
      },
    };

    render(
      <ProductMockup
        imageUrl={basePreview.imageUrl}
        template={templateWithPrintful}
        preview={basePreview}
        selectedColor="Black"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Printful preview/i)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalled();
    const img = await screen.findByAltText(/Printful mockup preview/i);
    expect(img).toBeInTheDocument();
    expect((img as HTMLImageElement).src).toContain("https://mock.printful/front.png");
  });

  it("falls back to local mockup and surfaces error when Printful fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const templateWithPrintful: ProductTemplate = {
      ...baseTemplate,
      mockup: {
        ...baseTemplate.mockup!,
        printful: {
          productId: 1234,
          placement: "front",
          variantIdsByColor: { Black: 4012 },
        },
      },
    };

    render(
      <ProductMockup
        imageUrl={basePreview.imageUrl}
        template={templateWithPrintful}
        preview={basePreview}
        selectedColor="Black"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/network down/i)).toBeInTheDocument();
    });

    const baseImg = screen.getByAltText(/base mockup/i);
    expect(baseImg).toBeInTheDocument();
  });
});
