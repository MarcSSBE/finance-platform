import { AmexWorkbench } from "@/components/amex/amex-workbench";
import { PageHeading } from "@/components/i18n/page-heading";
import { ReceiptsOnePdf } from "@/components/amex/receipts-one-pdf";
import { FortnoxSie } from "@/components/amex/fortnox-sie";

export default function AmexReceiptsPage() {
  return (
    <div className="space-y-8">
      <PageHeading section="amex" />
      <AmexWorkbench />
      <ReceiptsOnePdf />
      <FortnoxSie />
    </div>
  );
}
