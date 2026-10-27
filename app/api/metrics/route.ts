import { isClientSlug } from "@/lib/clients";
import { getMetrics } from "@/lib/data";
import { isPeriodKey } from "@/lib/periods";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const client = params.get("client");
  const period = params.get("period");
  if (!(client === "all" || isClientSlug(client)) || !isPeriodKey(period)) {
    return Response.json({ error: "client 또는 period 값이 올바르지 않아요" }, { status: 400 });
  }
  return Response.json(await getMetrics(client, period));
}
