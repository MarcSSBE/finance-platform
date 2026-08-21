import { IncomeWorkbench } from "@/components/income/income-workbench";
import { PageHeading } from "@/components/i18n/page-heading";

export default function IncomePage() {
  return (
    <div className="space-y-8">
      <PageHeading section="income" />
      <IncomeWorkbench />
    </div>
  );
}
