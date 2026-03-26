"use client";
import { useEffect } from "react";

export default function CallbackPage() {
  useEffect(() => {
    // The actual OAuth callback is handled by /api/auth/github/callback
    // This page is just a fallback if someone navigates here directly
    window.location.href = "/dashboard";
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-[var(--muted-foreground)]">Signing in...</p>
    </main>
  );
}
