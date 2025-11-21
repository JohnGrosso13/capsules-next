"use client";

import * as React from "react";

import { PrompterToolbar } from "@/components/prompter/PrompterToolbar";
import type { PrompterToolKey } from "@/components/prompter/tools";
import type { LocalAttachment } from "@/hooks/useAttachmentUpload";

const meta = {
  title: "Prompter/PrompterToolbar",
  component: PrompterToolbar,
};

export default meta;

const sampleAttachment: LocalAttachment = {
  id: "att-1",
  name: "sunset.png",
  size: 245_000,
  mimeType: "image/png",
  status: "ready",
  url: "https://example.com/sunset.png",
  progress: 100,
  role: "reference",
  source: "user",
};

const suggestedTools: Array<{ key: PrompterToolKey; label: string }> = [
  { key: "logo", label: "Brand Logo" },
  { key: "poll", label: "Create Poll" },
];

export function Default() {
  const [text, setText] = React.useState("Summarize my Thursday highlights");
  const [activeTool, setActiveTool] = React.useState<PrompterToolKey | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div style={{ maxWidth: 640 }}>
      <PrompterToolbar
        inputRef={inputRef}
        text={text}
        placeholder="Ask Capsule AI for ideas..."
        onTextChange={setText}
        buttonLabel="Draft"
        buttonClassName="genBtn genBtnPost"
        buttonDisabled={false}
        onGenerate={() => console.log("generate")}
        dataIntent="post"
        fileInputRef={fileInputRef}
        uploading={false}
        onAttachClick={() => console.log("attach")}
        onFileChange={() => undefined}
        manualIntent={null}
        manualPostMode={null}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((value) => !value)}
        onSelectIntent={() => setMenuOpen(false)}
        anchorRef={anchorRef}
        menuRef={menuRef}
        voiceSupported
        voiceStatus="idle"
        onVoiceToggle={() => console.log("voice-toggle")}
        voiceLabel="Start voice capture"
        hint="AI will draft this for you."
        attachments={[sampleAttachment]}
        uploadingAttachment={null}
        onRemoveAttachment={(id) => console.log("remove attachment", id)}
        suggestedTools={suggestedTools}
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onClearTool={() => setActiveTool(null)}
      />
    </div>
  );
}
