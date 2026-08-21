import { InvoicesWorkbench } from "@/components/invoices/invoices-workbench";
import { PageHeading } from "@/components/i18n/page-heading";

export default function AdsInvoicesPage() {
  return (
    <div className="space-y-8">
      <PageHeading section="ads" />
      <InvoicesWorkbench />
    </div>
  );
}
