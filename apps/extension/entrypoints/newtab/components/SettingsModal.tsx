import { useState } from "react";
import { Button, Dialog, InputArea, Select, Switch } from "@cloudflare/kumo";
import { XIcon } from "@phosphor-icons/react";
import { MODEL_CHOICES, type HomepageModel } from "@homepage/agent-core";
import { REBUILD_INTERVAL_CHOICES } from "@/lib/auto-rebuild";

const MODEL_ITEMS = MODEL_CHOICES.map((m) => ({ label: m.label, value: m.id }));
const INTERVAL_ITEMS = REBUILD_INTERVAL_CHOICES.map((h): { label: string; value: number } => ({
  label: h === 24 ? "24 hours (daily)" : `${h} hours`,
  value: h,
}));

export function SettingsModal({
  initialPrompt,
  model,
  onChangeModel,
  autoRebuild,
  onToggleAutoRebuild,
  intervalHours,
  onChangeInterval,
  onClose,
  onSave,
  onSaveAndRebuild,
}: {
  initialPrompt: string;
  model: HomepageModel;
  onChangeModel: (next: HomepageModel) => void;
  autoRebuild: boolean;
  onToggleAutoRebuild: (next: boolean) => void;
  intervalHours: number;
  onChangeInterval: (next: number) => void;
  onClose: () => void;
  onSave: (prompt: string) => void;
  onSaveAndRebuild: (prompt: string) => void;
}) {
  const [draft, setDraft] = useState(initialPrompt);
  const hasUnsavedEdits = draft !== initialPrompt;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => !open && onClose()}
      disablePointerDismissal={hasUnsavedEdits}
    >
      <Dialog size="xl" className="flex max-h-[calc(100dvh-8rem)] flex-col gap-6 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Dialog.Title className="text-xl font-semibold text-kumo-default">
              Customize your homepage
            </Dialog.Title>
            <Dialog.Description className="text-sm text-kumo-subtle">
              Model and schedule changes save as you make them.
            </Dialog.Description>
          </div>
          <Dialog.Close
            render={(props) => (
              <Button {...props} variant="ghost" shape="square" icon={<XIcon />} aria-label="Close" />
            )}
          />
        </div>

        <InputArea
          label="Instructions"
          description="Applied to every build. They take priority over the agent's defaults."
          placeholder="e.g. 'Focus on tech news and Rust releases', 'Always surface unread GitHub PRs first'"
          value={draft}
          onValueChange={setDraft}
          rows={9}
          className="w-full"
        />

        <Select
          label="Model"
          className="w-64"
          value={model}
          onValueChange={(next) => next && onChangeModel(next)}
          items={MODEL_ITEMS}
        />

        <div className="flex flex-col gap-4">
          <Switch
            label="Rebuild automatically"
            checked={autoRebuild}
            onCheckedChange={onToggleAutoRebuild}
          />
          <Select
            label="Rebuild every"
            description="Once your homepage is this old, the extension rebuilds it in the background using your API key."
            className="w-64"
            disabled={!autoRebuild}
            value={intervalHours}
            onValueChange={(next) => next && onChangeInterval(next)}
            items={INTERVAL_ITEMS}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => onSave(draft)}>
            Save
          </Button>
          <Button variant="primary" onClick={() => onSaveAndRebuild(draft)}>
            Save &amp; rebuild
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
