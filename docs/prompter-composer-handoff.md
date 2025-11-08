# Prompter → Composer Handoff

The AI Prompter now distinguishes between quick actions it can fulfill itself (posting straight to the feed, updating styles, etc.) and requests that require the full Composer workflow. When a request needs the Composer, the prompter emits a `PrompterHandoff` payload instead of a legacy `PrompterAction`.

## Contract

`PrompterHandoff` lives in `src/components/composer/prompter-handoff.ts` and currently supports:

- `ai_prompt`: text-based prompts and attachments that should flow into Composer chat/creation, plus optional compose hints (`composeMode`, `prefer`, etc.).
- `image_logo`: text prompts that need an AI-generated logo/image draft.
- `image_edit`: prompts tied to an existing attachment that should go through the AI image edit pipeline.

ComposerProvider exposes `handlePrompterHandoff` to process these payloads. Surfaces that wire the prompter to Composer (e.g., `AppShell`, `CapsuleScaffold`) should pass both `handlePrompterAction` (for quick actions) and `handlePrompterHandoff` to `<AiPrompterStage />`.

## Backwards Compatibility

`AiPrompterStage` still emits classic `PrompterAction`s for hosts that have not been updated. When `onHandoff` is not provided, the stage falls back to the previous behavior so custom surfaces (e.g., Capsule customizer) continue to work unchanged.
