import { AmexWorkbench } from "@/components/amex/amex-workbench";
import { PageHeading } from "@/components/i18n/page-heading";

export default function AmexReceiptsPage() {
  return (
    <div className="space-y-8">
      <PageHeading section="amex" />
      <AmexWorkbench />
    </div>
  );
}
