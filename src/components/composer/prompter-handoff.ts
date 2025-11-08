import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import type { ComposerMode } from "@/lib/ai/nav";

export type PrompterAiOptions = {
  composeMode?: ComposerMode | null;
  prefer?: string | null;
  extras?: Record<string, unknown>;
};

export type PrompterHandoff =
  | {
      intent: "ai_prompt";
      prompt: string;
      attachments?: PrompterAttachment[];
      options?: PrompterAiOptions;
    }
  | {
      intent: "image_logo";
      prompt: string;
    }
  | {
      intent: "image_edit";
      prompt: string;
      reference: PrompterAttachment;
    };
