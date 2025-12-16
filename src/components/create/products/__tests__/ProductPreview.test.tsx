// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductPreview } from "../ProductPreview";
import type { ProductPreviewModel } from "../types";
import type { ProductTemplate } from "../templates";

vi.mock("../ProductMockup", () => ({
  ProductMockup: ({ selectedColor, preview }: { selectedColor?: string | null; preview: ProductPreviewModel }) => (
    <div
      data-testid="mocked-mockup"
      data-color={selectedColor ?? ""}
      data-scale={preview.placementScale}
      data-offsetx={preview.placementOffsetX}
      data-offsety={preview.placementOffsetY}
    />
  ),
}));

const template: ProductTemplate = {
  id: "tee",
  label: "Tee",
  categoryId: "apparel",
  categoryLabel: "Apparel",
  mockup: {
    aspectRatio: 1,
    printArea: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    backgroundKind: "tee",
  },
};

const model: ProductPreviewModel = {
  title: "Sample Tee",
  summary: "Sample summary",
  price: 20,
  currency: "usd",
  imageUrl: "design.png",
  templateLabel: "Tee",
  templateId: "tee",
  capsuleName: "Capsule",
  colors: ["Black", "White"],
  primaryColor: "Black",
  sizes: ["M"],
  featured: true,
  publish: true,
  placementScale: 1,
  placementOffsetX: 0,
  placementOffsetY: 0,
};

describe("ProductPreview", () => {
  it("renders header and price", () => {
    render(<ProductPreview model={model} template={template} variant="panel" />);
    expect(screen.getByText("Sample Tee")).toBeInTheDocument();
    expect(screen.getByText("$20.00")).toBeInTheDocument();
  });

  it("passes swatch selection to ProductMockup", () => {
    render(<ProductPreview model={model} template={template} variant="panel" />);
    fireEvent.click(screen.getByText("White"));
    const mockup = screen.getByTestId("mocked-mockup");
    expect(mockup.getAttribute("data-color")).toBe("White");
  });

  it("updates mockup scale when zoom slider moves in overlay variant", () => {
    const handlePlacement = vi.fn();
    render(<ProductPreview model={model} template={template} variant="overlay" onPlacementChange={handlePlacement} />);
    const slider = screen.getByLabelText(/adjust design zoom/i);
    fireEvent.change(slider, { target: { value: "1.2" } });
    const mockup = screen.getByTestId("mocked-mockup");
    expect(mockup.getAttribute("data-scale")).toBe("1.2");
    expect(handlePlacement).toHaveBeenCalledWith(expect.objectContaining({ scale: 1.2 }));
  });

  it("updates offsets when sliders move", () => {
    const handlePlacement = vi.fn();
    render(<ProductPreview model={model} template={template} variant="overlay" onPlacementChange={handlePlacement} />);
    const xSlider = screen.getByLabelText(/move design horizontally/i);
    const ySlider = screen.getByLabelText(/move design vertically/i);
    fireEvent.change(xSlider, { target: { value: "0.25" } });
    fireEvent.change(ySlider, { target: { value: "-0.4" } });
    const mockup = screen.getByTestId("mocked-mockup");
    expect(mockup.getAttribute("data-offsetx")).toBe("0.25");
    expect(mockup.getAttribute("data-offsety")).toBe("-0.4");
    expect(handlePlacement).toHaveBeenCalledWith(expect.objectContaining({ offsetX: 0.25 }));
    expect(handlePlacement).toHaveBeenCalledWith(expect.objectContaining({ offsetY: -0.4 }));
  });
});
