import ClientReview from "@/components/ClientReview";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClientReview token={token} />;
}
