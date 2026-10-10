import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Tooltip, TooltipProvider } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon, GearSixIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { DEFAULT_MODEL, type HomepageModel } from "@homepage/agent-core";
import { DEFAULT_REBUILD_INTERVAL_HOURS } from "@/lib/auto-rebuild";
import { BUILD_STEPS } from "@/lib/protocol";
import { KEYS, extensionStore, loadHomepage, loadSettings, saveSetting } from "@/lib/storage";
import { toRenderable } from "@/lib/transpile";
import { ApiKeySetup } from "./components/ApiKeySetup";
import { BuildProgress } from "./components/BuildProgress";
import { HomepagePreview } from "./components/HomepagePreview";
import { SettingsModal } from "./components/SettingsModal";
import { useHomepageBuild } from "./useHomepageBuild";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState<HomepageModel>(DEFAULT_MODEL);
  const [autoRebuild, setAutoRebuild] = useState(true);
  const [intervalHours, setIntervalHours] = useState(DEFAULT_REBUILD_INTERVAL_HOURS);
  /** Transpiled homepage, ready for Sandpack. */
  const [renderedCode, setRenderedCode] = useState<string | null>(null);
  /** A session left mid-flight, offered as "Resume interrupted build". */
  const [resumable, setResumable] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  /** Expand the full progress view over an existing homepage. */
  const [viewProgress, setViewProgress] = useState(false);
  /** The error the user dismissed, so a stale banner doesn't linger. */
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const { state, build, cancel } = useHomepageBuild((code) => setRenderedCode(toRenderable(code)));

  // Once a build finishes, drop back to the homepage view.
  useEffect(() => {
    if (!state.running) setViewProgress(false);
  }, [state.running]);

  // Scheduled rebuilds are driven by the worker's alarm, not by opening a tab;
  // useHomepageBuild surfaces any build already in flight.
  useEffect(() => {
    (async () => {
      try {
        const [settings, homepage, activeSession] = await Promise.all([
          loadSettings(),
          loadHomepage(),
          extensionStore.get<string>(KEYS.activeSessionId),
        ]);
        setApiKey(settings.apiKey);
        setSystemPrompt(settings.systemPrompt);
        setModel(settings.model);
        setAutoRebuild(settings.autoRebuild);
        setIntervalHours(settings.rebuildIntervalHours ?? DEFAULT_REBUILD_INTERVAL_HOURS);
        setResumable(activeSession ?? null);
        if (homepage?.code) setRenderedCode(toRenderable(homepage.code));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveKey = useCallback(async (key: string) => {
    await saveSetting("apiKey", key);
    setApiKey(key);
  }, []);

  const savePrompt = useCallback(async (prompt: string) => {
    await saveSetting("systemPrompt", prompt);
    setSystemPrompt(prompt);
    setShowSettings(false);
  }, []);

  const savePromptAndRebuild = useCallback(
    async (prompt: string) => {
      await savePrompt(prompt);
      setRenderedCode(null);
      build();
    },
    [savePrompt, build],
  );

  // These persist immediately; the worker reads them on its next heartbeat or build.
  const changeModel = useCallback(async (next: HomepageModel) => {
    setModel(next);
    await saveSetting("model", next);
  }, []);
  const toggleAutoRebuild = useCallback(async (next: boolean) => {
    setAutoRebuild(next);
    await saveSetting("autoRebuild", next);
  }, []);
  const changeInterval = useCallback(async (next: number) => {
    setIntervalHours(next);
    await saveSetting("rebuildIntervalHours", next);
  }, []);

  if (loading) return <div className="p-5 text-center text-kumo-subtle">Loading…</div>;
  if (!apiKey) return <ApiKeySetup onSave={saveKey} />;

  // With no homepage to fall back to, a running build takes over the tab.
  if (state.running && (!renderedCode || viewProgress)) {
    return (
      <BuildProgress
        state={state}
        onCancel={cancel}
        onBack={renderedCode ? () => setViewProgress(false) : undefined}
      />
    );
  }

  if (!renderedCode) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-28">
        <h1 className="text-2xl font-semibold text-kumo-default">Build your homepage</h1>
        <p className="text-base/7 text-kumo-subtle">
          The agent reads your browsing history, opens the pages you actually follow, and writes a
          homepage from what it finds today.
        </p>
        {state.error && (
          <Banner variant="error" icon={<WarningCircleIcon weight="fill" />} description={state.error} />
        )}
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => build()}>
            Build today&apos;s homepage
          </Button>
          {resumable && (
            <Button variant="secondary" onClick={() => build({ resume: true })}>
              Resume interrupted build
            </Button>
          )}
        </div>
      </div>
    );
  }

  const showError = state.error && dismissedError !== state.error;
  const buildingLabel = `Building ${Math.min(state.stepIndex + 1, BUILD_STEPS.length)}/${BUILD_STEPS.length}`;

  return (
    <div className="h-dvh w-screen">
      <TooltipProvider>
        <div className="fixed right-4 bottom-4 z-10 flex gap-1 opacity-60 transition-opacity focus-within:opacity-100 hover:opacity-100">
          {state.running ? (
            // A build is running in the background (from here, another tab, or the
            // scheduled rebuild). Let the user watch it without losing this page.
            <Tooltip
              content={`${buildingLabel}. View progress`}
              render={
                <Button
                  variant="primary"
                  size="sm"
                  shape="square"
                  icon={<ArrowsClockwiseIcon className="animate-spin" />}
                  aria-label={`${buildingLabel}. View progress`}
                  onClick={() => setViewProgress(true)}
                />
              }
            />
          ) : (
            <Tooltip
              content="Rebuild"
              render={
                <Button
                  size="sm"
                  shape="square"
                  icon={<ArrowsClockwiseIcon />}
                  aria-label="Rebuild"
                  onClick={() => build()}
                />
              }
            />
          )}
          <Tooltip
            content="Settings"
            render={
              <Button
                size="sm"
                shape="square"
                icon={<GearSixIcon />}
                aria-label="Settings"
                onClick={() => setShowSettings(true)}
              />
            }
          />
        </div>
      </TooltipProvider>

      {showError && (
        <div className="fixed top-5 left-5 z-10 w-full max-w-xl shadow-md">
          <Banner
            variant="error"
            icon={<WarningCircleIcon weight="fill" />}
            title="Build failed"
            description={state.error}
            action={
              <>
                <Banner.Action onClick={() => build()}>Retry</Banner.Action>
                <Banner.Action
                  variant="ghost"
                  icon={<XIcon />}
                  aria-label="Dismiss"
                  onClick={() => setDismissedError(state.error)}
                />
              </>
            }
          />
        </div>
      )}

      <HomepagePreview code={renderedCode} />

      {showSettings && (
        <SettingsModal
          initialPrompt={systemPrompt}
          model={model}
          onChangeModel={changeModel}
          autoRebuild={autoRebuild}
          onToggleAutoRebuild={toggleAutoRebuild}
          intervalHours={intervalHours}
          onChangeInterval={changeInterval}
          onClose={() => setShowSettings(false)}
          onSave={savePrompt}
          onSaveAndRebuild={savePromptAndRebuild}
        />
      )}
    </div>
  );
}
