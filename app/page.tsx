"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DashboardSkeleton } from "@/components/dashboard/skeleton";
import { CLIENTS } from "@/lib/clients";
import { readStoredClient } from "@/lib/use-preferences";

/** "/" 는 마지막으로 본 클라이언트(처음이면 첫 클라이언트)로 보낸다 */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/clients/${readStoredClient() ?? CLIENTS[0].slug}`);
  }, [router]);
  return <DashboardSkeleton />;
}
