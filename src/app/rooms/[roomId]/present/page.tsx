import { PresentClient } from "@/components/PresentClient";

export default async function PresentPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <PresentClient roomId={roomId} />;
}
