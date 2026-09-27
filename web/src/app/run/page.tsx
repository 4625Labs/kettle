import { requireSession } from "@/app/_lib/session";
import { RunViewLoading, RunViewError } from "@/components/run/RunViewStates";
import { LiveRunView } from "./_lib/LiveRunView";
import { getLatestRun } from "./_lib/data";
import { MOCK_TIMELINE } from "./_mock/data";
import { RunView } from "@/components/run/RunView";

// `?state=loading|error|mock` previews states that have no real trigger in
// this demo (nothing here can actually fail to load) or shows the original
// mock golden path for design review — never used by the live control bar.
export default async function RunPage({ searchParams }: PageProps<"/run">) {
  const session = await requireSession();
  const { state } = await searchParams;

  if (state === "loading") return <RunViewLoading />;
  if (state === "error") {
    return (
      <RunViewError message="Couldn't load this run. Check the worker is running and reload." />
    );
  }
  if (state === "mock") return <RunView timeline={MOCK_TIMELINE} />;

  const latest = await getLatestRun();

  return (
    <LiveRunView
      key={latest?.runId ?? "empty"}
      role={session.role}
      initialRunId={latest?.runId ?? null}
      initialOptions={latest?.options ?? {}}
      initialSteps={latest?.steps ?? []}
      initialHandoffs={latest?.handoffs ?? []}
      initialApprovals={latest?.approvals ?? []}
    />
  );
}
