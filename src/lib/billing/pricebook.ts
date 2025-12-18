const USD_MICROS_PER_DOLLAR = 1_000_000;

export const CREDIT_USD_VALUE = 0.001; // 1 credit = $0.001
export const USD_MICROS_PER_CREDIT = USD_MICROS_PER_DOLLAR * CREDIT_USD_VALUE; // 1,000 micros
export const PRICEBOOK_UNIT = {
  usdMicrosPerDollar: USD_MICROS_PER_DOLLAR,
  usdMicrosPerCredit: USD_MICROS_PER_CREDIT,
  creditLabel: "credit",
  creditUsdValue: CREDIT_USD_VALUE,
} as const;

export function usdMicrosToCredits(usdMicros: number): number {
  return usdMicros / USD_MICROS_PER_CREDIT;
}

export function creditsToUsdMicros(credits: number): number {
  return credits * USD_MICROS_PER_CREDIT;
}

type Vendor = "openai" | "runway" | "mux" | "cloudflare" | "pinecone" | "algolia";

export type PriceRate = {
  vendor: Vendor;
  resource: string;
  unit: string;
  quantity: number;
  usdMicros: number;
  usdMicrosPerUnit: number;
  credits: number;
  creditsPerUnit: number;
  notes?: string;
};

type RateInput = {
  vendor: Vendor;
  resource: string;
  unit: string;
  usd: number;
  quantity?: number;
  notes?: string;
};

function rate(input: RateInput): PriceRate {
  const quantity = input.quantity ?? 1;
  const usdMicros = Math.round(input.usd * USD_MICROS_PER_DOLLAR);
  const usdMicrosPerUnit = usdMicros / quantity;
  const base: PriceRate = {
    vendor: input.vendor,
    resource: input.resource,
    unit: input.unit,
    quantity,
    usdMicros,
    usdMicrosPerUnit,
    credits: usdMicrosToCredits(usdMicros),
    creditsPerUnit: usdMicrosToCredits(usdMicrosPerUnit),
  };
  if (input.notes) {
    base.notes = input.notes;
  }
  return base;
}

export const PRICEBOOK = {
  wallets: {
    personal: {
      name: "Personal Credits",
      scope: "user",
      uses: [
        "image generation",
        "transcription",
        "Personal Coach edits",
        "PDFs/PPTs generation (includes embedded images)",
        '"Create page" assets (logos, banners, posts, thumbnails)',
        "anything personal/unpublished",
      ],
    },
    capsule: {
      name: "Capsule Power",
      scope: "capsule",
      uses: [
        "Mux live + VOD storage + delivery",
        "shared Capsule memory (long retention, deep indexing)",
        "Capsule-wide automations (weekly recap, wiki updates, ladder upkeep)",
        "party chat agent costs (if metered)",
        "anything benefiting the capsule as a whole",
      ],
    },
  },
  ledger: {
    flow: [
      "estimate and create a hold",
      "run the job",
      "log actual units used",
      "finalize (debit actual) or refund unused hold",
    ],
  },
  openai: {
    image: {
      gptImage1Mini: {
        low: rate({
          vendor: "openai",
          resource: "gpt-image-1-mini:low:1024",
          unit: "image_1024",
          usd: 0.005,
          notes: "Low quality 1024x1024",
        }),
        medium: rate({
          vendor: "openai",
          resource: "gpt-image-1-mini:medium:1024",
          unit: "image_1024",
          usd: 0.011,
          notes: "Medium quality 1024x1024",
        }),
        high: rate({
          vendor: "openai",
          resource: "gpt-image-1-mini:high:1024",
          unit: "image_1024",
          usd: 0.036,
          notes: "High quality 1024x1024",
        }),
      },
    },
    transcription: {
      gpt4oMiniPerMinute: rate({
        vendor: "openai",
        resource: "gpt-4o-mini-transcribe:minute",
        unit: "minute_audio",
        usd: 0.003,
      }),
    },
    text: {
      gpt5Mini: {
        inputPerMillion: rate({
          vendor: "openai",
          resource: "gpt-5-mini:input",
          unit: "token",
          quantity: 1_000_000,
          usd: 0.25,
          notes: "Input tokens; per-token cost requires dividing by quantity",
        }),
        outputPerMillion: rate({
          vendor: "openai",
          resource: "gpt-5-mini:output",
          unit: "token",
          quantity: 1_000_000,
          usd: 2,
          notes: "Output typically dominates chat cost",
        }),
      },
      gpt52: {
        outputPerMillion: rate({
          vendor: "openai",
          resource: "gpt-5.2:output",
          unit: "token",
          quantity: 1_000_000,
          usd: 14,
        }),
      },
      gpt52Pro: {
        outputPerMillion: rate({
          vendor: "openai",
          resource: "gpt-5.2-pro:output",
          unit: "token",
          quantity: 1_000_000,
          usd: 168,
        }),
      },
    },
    video: {
      sora2: {
        basePerSecond: rate({
          vendor: "openai",
          resource: "sora-2:base:second",
          unit: "second_video",
          usd: 0.1,
          notes: "sora-2 base, per second",
        }),
        pro720PerSecond: rate({
          vendor: "openai",
          resource: "sora-2-pro:720p:second",
          unit: "second_video",
          usd: 0.3,
          notes: "sora-2-pro 720p, per second",
        }),
        pro1792PerSecond: rate({
          vendor: "openai",
          resource: "sora-2-pro:1792:second",
          unit: "second_video",
          usd: 0.5,
          notes: "sora-2-pro 1792×1024 or 1024×1792, per second",
        }),
      },
    },
  },
  runway: {
    runwayCredit: rate({
      vendor: "runway",
      resource: "runway:credit",
      unit: "runway_credit",
      usd: 0.01,
      notes: "$0.01 per Runway credit",
    }),
    gen4PerSecond: rate({
      vendor: "runway",
      resource: "runway:gen-4-turbo:second",
      unit: "second",
      usd: 0.05,
      notes: "Gen-4 Turbo ~5 Runway credits per second",
    }),
  },
  mux: {
    liveInputPerMinute: rate({
      vendor: "mux",
      resource: "mux:live_input:minute",
      unit: "minute",
      usd: 0.025,
      notes: "Live input starting rate",
    }),
    storagePerMinuteMonth: rate({
      vendor: "mux",
      resource: "mux:storage:minute_month",
      unit: "stored_minute_month",
      usd: 0.0024,
      notes: "720p storage per minute per month",
    }),
    deliveryPerViewerMinute: rate({
      vendor: "mux",
      resource: "mux:delivery:viewer_minute",
      unit: "viewer_minute",
      usd: 0.0008,
      notes: "720p delivery starting rate",
    }),
  },
  storage: {
    r2StandardGbMonth: rate({
      vendor: "cloudflare",
      resource: "r2:standard:gb_month",
      unit: "gb_month",
      usd: 0.015,
    }),
    r2StandardGbDayApprox: rate({
      vendor: "cloudflare",
      resource: "r2:standard:gb_day",
      unit: "gb_day",
      usd: 0.015 / 30,
      notes: "Approximate per-day rate from monthly price (30-day month)",
    }),
  },
  pinecone: {
    storageGbMonth: rate({
      vendor: "pinecone",
      resource: "pinecone:storage:gb_month",
      unit: "gb_month",
      usd: 0.33,
      notes: "Serverless storage",
    }),
    writeUnitsStandardPerMillion: rate({
      vendor: "pinecone",
      resource: "pinecone:wu:standard",
      unit: "write_unit",
      quantity: 1_000_000,
      usd: 4,
      notes: "Standard WUs per million",
    }),
    readUnitsStandardPerMillion: rate({
      vendor: "pinecone",
      resource: "pinecone:ru:standard",
      unit: "read_unit",
      quantity: 1_000_000,
      usd: 16,
      notes: "Standard RUs per million",
    }),
  },
  algolia: {
    searchesPerThousand: rate({
      vendor: "algolia",
      resource: "algolia:searches:per_1000",
      unit: "search",
      quantity: 1_000,
      usd: 0.5,
      notes: "Grow plan search overages; roughly 0.5 credits per search",
    }),
    recordsPerThousandMonth: rate({
      vendor: "algolia",
      resource: "algolia:records:per_1000_month",
      unit: "record_month",
      quantity: 1_000,
      usd: 0.4,
      notes: "Grow plan records overage; roughly 0.4 credits per record-month",
    }),
  },
} as const;

export type Pricebook = typeof PRICEBOOK;
