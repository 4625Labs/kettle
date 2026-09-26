import { requireSession } from "@/app/_lib/session";
import { RunView } from "@/components/run/RunView";
import { RunViewLoading, RunViewError } from "@/components/run/RunViewStates";
import { MOCK_TIMELINE } from "./_mock/data";

// `?state=loading|error|empty` is a phase-1-only preview hook for states that
// have no real trigger yet (nothing async, no run can fail). Drop it once
// phase 2 wires a real fetch + Realtime subscription with genuine loading/
// error conditions.
export default async function RunPage({
  searchParams,
}: PageProps<"/run">) {
  await requireSession();
  const { state } = await searchParams;

  if (state === "loading") return <RunViewLoading />;
  if (state === "error") {
    return (
      <RunViewError message="Couldn't load this run. Check the worker is running and reload." />
    );
  }

  return <RunView timeline={state === "empty" ? [] : MOCK_TIMELINE} />;
}
