import { AmazonWorkbench } from "@/components/amazon/amazon-workbench";
import { PageHeading } from "@/components/i18n/page-heading";

export default function AmazonInvoicesPage() {
  return (
    <div className="space-y-8">
      <PageHeading section="amazon" />
      <AmazonWorkbench />
    </div>
  );
}
