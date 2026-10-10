import { useState } from "react";
import { Button, Input } from "@cloudflare/kumo";

export function ApiKeySetup({ onSave }: { onSave: (key: string) => void }) {
  const [value, setValue] = useState("");
  const valid = value.trim().startsWith("sk-ant-");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-24">
      <h1 className="text-2xl font-semibold text-kumo-default">Connect your Anthropic API key</h1>
      <p className="text-base/7 text-kumo-subtle">
        The agent runs inside this extension and talks to the Anthropic API directly. Your key
        is stored in <code>chrome.storage.local</code> on this machine and is never sent
        anywhere else.
      </p>
      <Input
        type="password"
        aria-label="Anthropic API key"
        className="w-full font-mono"
        placeholder="sk-ant-..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button
        variant="primary"
        className="self-start"
        disabled={!valid}
        onClick={() => onSave(value.trim())}
      >
        Save key
      </Button>
    </div>
  );
}
