import { requireSession } from "@/app/_lib/session";
import { getPendingApprovals } from "./_lib/data";
import { ApprovalItem } from "./_lib/ApprovalItem";

export default async function ApprovalsPage() {
  const session = await requireSession();
  const approvals = await getPendingApprovals(session.role);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
      <p className="mt-1 text-sm text-foreground/60">
        {session.role === "ops_manager"
          ? "Everything pending, across every role."
          : "Pending decisions assigned to your role."}
      </p>

      {approvals.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/50">Nothing waiting on you right now.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {approvals.map((approval) => (
            <ApprovalItem key={approval.id} approval={approval} />
          ))}
        </ul>
      )}
    </div>
  );
}
