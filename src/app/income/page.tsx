import { IncomeWorkbench } from "@/components/income/income-workbench";
import { PageHeading } from "@/components/i18n/page-heading";
import { WorldFirstTypes } from "@/components/income/worldfirst-types";

export default function IncomePage() {
  return (
    <div className="space-y-8">
      <PageHeading section="income" />
      <IncomeWorkbench />
      <WorldFirstTypes />
    </div>
  );
}
