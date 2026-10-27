import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/dashboard";
import { DashboardSkeleton } from "@/components/dashboard/skeleton";
import { CLIENT_SLUGS, getClient, isClientSlug } from "@/lib/clients";

export function generateStaticParams() {
  return CLIENT_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata(props: PageProps<"/clients/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return { title: `${getClient(slug)?.name ?? "클라이언트"} · 마케팅 대시보드` };
}

async function ClientDashboard({ params }: { params: PageProps<"/clients/[slug]">["params"] }) {
  const { slug } = await params;
  if (!isClientSlug(slug)) notFound();
  return <Dashboard client={slug} />;
}

export default function ClientPage(props: PageProps<"/clients/[slug]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ClientDashboard params={props.params} />
    </Suspense>
  );
}
