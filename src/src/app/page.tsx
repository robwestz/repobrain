import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/auth";
import Link from "next/link";

export default async function Home() {
  const session = await getSession();
  if (session.userId) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">RepoBrain</h1>
        <p className="mt-3 text-lg text-[var(--muted-foreground)]">
          Understand any codebase as if you wrote it
        </p>
      </div>
      <Link
        href="/auth/login"
        className="rounded-lg bg-[var(--primary)] px-6 py-3 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
      >
        Sign in with GitHub
      </Link>
    </main>
  );
}
