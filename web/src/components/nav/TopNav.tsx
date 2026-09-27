import Link from "next/link";
import { getSession } from "@/app/_lib/session";
import { signOut } from "@/app/_lib/actions";

const ROLE_LABEL: Record<string, string> = {
  ops_manager: "Ops Manager",
  sales_rep: "Sales Rep",
  finance_controller: "Finance Controller",
};

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-surface hover:text-foreground"
    >
      {children}
    </Link>
  );
}

export async function TopNav() {
  const session = await getSession();

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Kettle
      </Link>

      {session ? (
        <nav className="order-3 flex w-full items-center gap-1 sm:order-none sm:w-auto">
          <NavLink href="/run">Run</NavLink>
          <NavLink href="/approvals">Approvals</NavLink>
          <NavLink href="/deals">Deals</NavLink>
        </nav>
      ) : null}

      <div className="flex items-center gap-2 sm:gap-3">
        {session ? (
          <>
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground/70">
              {ROLE_LABEL[session.role] ?? session.role}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-surface hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </>
        ) : (
          <NavLink href="/login">Sign in</NavLink>
        )}
      </div>
    </header>
  );
}
