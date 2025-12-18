import { describe, expect, it } from "vitest";

import { PRICEBOOK, USD_MICROS_PER_CREDIT } from "@/lib/billing/pricebook";

describe("pricebook", () => {
  it("exposes pinecone storage and unit pricing in credits", () => {
    const storage = PRICEBOOK.pinecone.storageGbMonth;
    expect(storage.creditsPerUnit).toBeCloseTo(330, 5);
    expect(storage.usdMicros).toBe(330_000);
  });

  it("computes pinecone standard WU/RU per-unit credits", () => {
    const wu = PRICEBOOK.pinecone.writeUnitsStandardPerMillion;
    const ru = PRICEBOOK.pinecone.readUnitsStandardPerMillion;
    expect(wu.creditsPerUnit).toBeCloseTo(0.004, 6);
    expect(ru.creditsPerUnit).toBeCloseTo(0.016, 6);
    expect(wu.usdMicrosPerUnit).toBeCloseTo(4 * 1_000_000 / 1_000_000, 5);
    expect(ru.usdMicrosPerUnit).toBeCloseTo(16 * 1_000_000 / 1_000_000, 5);
  });

  it("maps Sora and Algolia pricing to expected credits", () => {
    const soraBase = PRICEBOOK.openai.video.sora2.basePerSecond;
    const soraPro720 = PRICEBOOK.openai.video.sora2.pro720PerSecond;
    const soraPro1792 = PRICEBOOK.openai.video.sora2.pro1792PerSecond;
    expect(soraBase.creditsPerUnit).toBeCloseTo(100, 5); // $0.10/sec -> 100 credits
    expect(soraPro720.creditsPerUnit).toBeCloseTo(300, 5); // $0.30/sec -> 300 credits
    expect(soraPro1792.creditsPerUnit).toBeCloseTo(500, 5); // $0.50/sec -> 500 credits

    const algoliaSearch = PRICEBOOK.algolia.searchesPerThousand;
    const algoliaRecords = PRICEBOOK.algolia.recordsPerThousandMonth;
    expect(algoliaSearch.creditsPerUnit).toBeCloseTo(0.5, 6); // $0.50 / 1k searches -> 0.5 credits/search
    expect(algoliaRecords.creditsPerUnit).toBeCloseTo(0.4, 6); // $0.40 / 1k records -> 0.4 credits/record-month
  });

  it("keeps base unit conversion intact", () => {
    expect(USD_MICROS_PER_CREDIT).toBe(1_000);
  });
});
