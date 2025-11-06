"use client";

import { AiImageRunProvider } from "@/components/providers/AiImageRunProvider";

export type AiImageRunToastsProps = {
  supabaseUserId?: string | null;
};

export function AiImageRunToasts({ supabaseUserId = null }: AiImageRunToastsProps) {
  return <AiImageRunProvider supabaseUserId={supabaseUserId}>{null}</AiImageRunProvider>;
}

export default AiImageRunToasts;
