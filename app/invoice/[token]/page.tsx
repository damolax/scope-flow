import InvoiceView from "@/components/InvoiceView";

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvoiceView token={token} />;
}
