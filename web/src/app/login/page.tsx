"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/_lib/actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signIn,
    undefined,
  );

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to Kettle</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Ops manager, sales rep, or finance controller — your role decides what
          you can approve.
        </p>

        <form action={action} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-agent-sales"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-agent-sales"
            />
          </div>

          {state?.error && (
            <p role="alert" className="text-sm text-anomaly">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
