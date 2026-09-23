/**
 * UI translations. English is the source of truth; Swedish must match its
 * shape (enforced by the `Messages` type). Dynamic strings are functions.
 * Only interface chrome is translated — the finance documents keep their
 * original language.
 */

export const LANGS = ["en", "sv"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";
export const LANG_COOKIE = "lang";

const en = {
  common: {
    brand: "Finance Platform",
    tagline: "Monthly close · Burman Enterprise",
    footer: "Totals are computed in code and shown with their work, never estimated.",
    sections: "Sections",
    startOver: "Start over",
    chooseDifferentFile: "Choose a different file",
    tryAnother: "Try another file",
    language: "Language",
  },
  tabs: { income: "Income", ads: "Ads invoices", amazon: "Amazon" },
  income: {
    title: "Income summary",
    desc: "Upload the WorldFirst income export and get the correct monthly total, then a clean workbook with the total written in.",
    dropTitle: "Drop the WorldFirst export here",
    dropOr: "or click to choose the .xlsx file you downloaded",
    dropHint: "We read the “Amount entered” column and total it for you",
    exportNote:
      "Export from WorldFirst filtered to TikTok Inc. income, choose XLS detail. The amounts come in as text, so Excel’s SUM shows 0. This reads them correctly and gives you the real total.",
    reading: (name: string) => `Reading ${name}…`,
    readingSub: "Coercing the text amounts to numbers and totalling column D.",
    errTitle: "We couldn’t read that file",
    totalIncome: "Total income",
    countedFrom: (n: number, col: string, header: string) =>
      `${n} rows counted from column ${col} (“${header}”), read from the text values Excel could not add.`,
    everyRowCounted: "Every row counted",
    needLook: (n: number) => `${n} need a look`,
    countedRows: "Counted rows",
    colRow: "Row",
    colDescription: "Description",
    colAmount: "Amount entered",
    total: "Total",
    otherCurrencies: "Other currencies",
    rowsLabel: "rows",
    notCounted: (n: number) => `${n} row${n > 1 ? "s" : ""} not counted`,
    rowN: (n: number) => `row ${n}`,
    reasonNoAmount: "No amount in this row",
    reasonNotNumber: "Amount is not a number",
    negativeNote: (n: number) =>
      `${n} row${n > 1 ? "s are" : " is"} negative (a refund or reversal) and ${n > 1 ? "were" : "was"} subtracted from the total.`,
    exportBtn: "Export summarized .xlsx",
    exporting: "Preparing…",
    toastExported: "Summarized workbook downloaded",
    insightsTitle: "Insights",
    insightsAnalyzing: "Looking for anything worth a glance…",
    insightsAllClear: "Nothing unusual stood out in this month.",
    insightsAiNote: "Written by AI",
    anomalyMixedCurrencies: (n: number) =>
      `Income arrived in ${n} currencies. The headline total above shows the main one only.`,
    anomalyDuplicateAmount: (amount: string, currency: string, n: number) =>
      `The same amount (${amount} ${currency}) appears in ${n} rows. Worth a quick check for a duplicate.`,
    anomalyLargeOutlier: (amount: string, currency: string, n: number) =>
      n > 1
        ? `${n} rows are much larger than a typical row (up to ${amount} ${currency}).`
        : `One row (${amount} ${currency}) is much larger than a typical row.`,
    anomalyRows: (rows: string) => `rows ${rows}`,
  },
  ads: {
    title: "Ads invoices",
    desc: "Upload the WorldFirst statement and the TikTok invoice PDFs. The platform matches them, flags anything missing on either side, and renames each invoice ready to file.",
    statementLabel: "WorldFirst statement",
    statementHint: "The ads-payment statement PDF (one file)",
    invoicesLabel: "Invoice PDFs",
    invoicesHint: "Drop the TikTok invoices (one or many)",
    clear: "Clear",
    reconcile: (n: number) => (n > 0 ? `Reconcile ${n} invoice${n > 1 ? "s" : ""}` : "Reconcile"),
    addBoth: "Add the statement and at least one invoice.",
    workingTitle: "Reading the statement and invoices…",
    workingSub: "Extracting each total and matching by amount and date.",
    reconciliation: "Reconciliation",
    matched: "matched",
    paymentsNoInvoiceShort: "payments w/o invoice",
    invoicesNoPaymentShort: "invoices w/o payment",
    fullyReconciled: "Fully reconciled",
    needsLook: "Needs a look",
    invoicesTotal: (n: number) => `Invoices total (${n})`,
    statementTotal: "Statement total",
    difference: "Difference",
    bMatched: "Matched",
    bPaymentsNoInvoice: "Payments with no invoice",
    bInvoicesNoPayment: "Invoices with no payment",
    bUnreadable: "Could not read",
    paidOn: (d: string) => `paid ${d}`,
    invoiceMissing: "invoice missing",
    noMatchingPayment: "no matching payment",
    readByAi: "Read by AI, confirm the amount",
    downloadZip: "Download renamed invoices (.zip)",
    preparing: "Preparing…",
    zipNote:
      "The zip mirrors the Drive layout (Accounting / month / Tiktok). Or file straight to Google Drive with the button above.",
    toastDownloaded: "Renamed invoices downloaded",
    toastDownloadedDesc: "Folders mirror the Drive layout.",
    fileToDrive: "File to Google Drive",
    filing: "Filing…",
    filedTitle: (u: number) => `Filed ${u} invoice${u !== 1 ? "s" : ""} to Google Drive`,
    filedDesc: (s: number, f: number) =>
      [s > 0 ? `${s} already there` : "", f > 0 ? `${f} failed` : ""].filter(Boolean).join(" · ") ||
      "Filed into Accounting / month / Tiktok.",
    driveError: "Filing to Drive failed.",
    slackNotified: "Slack notified",
  },
  amazon: {
    title: "Amazon fee invoices",
    desc: "Upload the Amazon Seller Central tax documents (the Tax Document Library ZIP, or the PDFs). The platform reads each invoice, renames it, and files it into Google Drive by month.",
    uploadLabel: "Amazon invoices",
    uploadHint: "Drop the Tax Document Library ZIP or the invoice PDFs",
    clear: "Clear",
    process: (n: number) => (n > 0 ? `Read ${n} file${n > 1 ? "s" : ""}` : "Read invoices"),
    addFiles: "Add the ZIP export or at least one PDF.",
    workingTitle: "Reading the Amazon invoices…",
    workingSub: "Extracting each invoice number, date, and total.",
    summary: "Invoices read",
    invoicesCounted: (n: number) => `${n} invoice${n !== 1 ? "s" : ""} read`,
    provisionalNote:
      "Filed as Amazon <Country> <Type> <CUR> <Total>, into the Amazon folder for the invoice month, under a per-country subfolder.",
    colInvoice: "Invoice",
    colCountry: "Country",
    colType: "Type",
    colDate: "Date",
    colAmount: "Total",
    docMerchant: "Merchant",
    docFba: "Fulfillment",
    docCreditMerchant: "Merchant VAT credit",
    docCreditFba: "Fulfillment VAT credit",
    docEpr: "EPR",
    docOther: "Invoice",
    readByAi: "Read by AI, confirm the amount",
    fileToDrive: "File to Google Drive",
    filing: "Filing…",
    downloadZip: "Download renamed (.zip)",
    preparing: "Preparing…",
    zipNote:
      "The zip mirrors the Drive layout (Accounting / month / Amazon). Or file straight to Google Drive with the button above.",
    bUnreadable: "Could not read",
    filedTitle: (u: number) => `Filed ${u} invoice${u !== 1 ? "s" : ""} to Google Drive`,
    filedDesc: (s: number, f: number) =>
      [s > 0 ? `${s} already there` : "", f > 0 ? `${f} failed` : ""].filter(Boolean).join(" · ") ||
      "Filed into Accounting / month / Amazon.",
    filedResultTitle: "Filing result",
    filedReceived: (n: number) => `${n} received`,
    filedUploaded: (n: number) => `${n} filed`,
    filedSkipped: (n: number) => `${n} already there`,
    filedFailed: (n: number) => `${n} could not be filed`,
    filedComplete: "Every invoice received was accounted for.",
    filedIncomplete:
      "Some invoices were not filed. Check the list below, then re-run to fill the gaps (already-filed ones are skipped).",
    sizeWarn: (mb: string) =>
      `This upload is ${mb} MB. Uploads over about 4.5 MB can be rejected before they reach the server. Upload the Tax Document Library ZIP (smaller), or split it into two uploads.`,
    driveError: "Filing to Drive failed.",
    toastDownloaded: "Renamed invoices downloaded",
  },
};

export type Messages = typeof en;

const sv: Messages = {
  common: {
    brand: "Finance Platform",
    tagline: "Månadsavslut · Burman Enterprise",
    footer: "Summor beräknas i kod och visas med sitt underlag, aldrig uppskattade.",
    sections: "Sektioner",
    startOver: "Börja om",
    chooseDifferentFile: "Välj en annan fil",
    tryAnother: "Försök med en annan fil",
    language: "Språk",
  },
  tabs: { income: "Intäkter", ads: "Annonsfakturor", amazon: "Amazon" },
  income: {
    title: "Intäktssammanställning",
    desc: "Ladda upp WorldFirst-intäktsexporten och få den korrekta månadssumman, och sedan en ren arbetsbok med summan ifylld.",
    dropTitle: "Släpp WorldFirst-exporten här",
    dropOr: "eller klicka för att välja .xlsx-filen du laddade ner",
    dropHint: "Vi läser kolumnen “Amount entered” och summerar den åt dig",
    exportNote:
      "Exportera från WorldFirst filtrerat på TikTok Inc.-intäkter, välj XLS-detalj. Beloppen kommer in som text, så Excels SUMMA visar 0. Det här läser dem korrekt och ger dig den verkliga summan.",
    reading: (name: string) => `Läser ${name}…`,
    readingSub: "Omvandlar textbeloppen till tal och summerar kolumn D.",
    errTitle: "Vi kunde inte läsa den filen",
    totalIncome: "Totala intäkter",
    countedFrom: (n: number, col: string, header: string) =>
      `${n} rader räknade från kolumn ${col} (“${header}”), lästa från textvärdena som Excel inte kunde summera.`,
    everyRowCounted: "Alla rader räknade",
    needLook: (n: number) => `${n} behöver granskas`,
    countedRows: "Räknade rader",
    colRow: "Rad",
    colDescription: "Beskrivning",
    colAmount: "Belopp",
    total: "Summa",
    otherCurrencies: "Övriga valutor",
    rowsLabel: "rader",
    notCounted: (n: number) => `${n} rad${n > 1 ? "er" : ""} inte räknad${n > 1 ? "e" : ""}`,
    rowN: (n: number) => `rad ${n}`,
    reasonNoAmount: "Inget belopp på den här raden",
    reasonNotNumber: "Beloppet är inte ett tal",
    negativeNote: (n: number) =>
      `${n} rad${n > 1 ? "er är" : " är"} negativ${n > 1 ? "a" : ""} (en återbetalning) och drogs av från summan.`,
    exportBtn: "Exportera sammanställd .xlsx",
    exporting: "Förbereder…",
    toastExported: "Sammanställd arbetsbok nedladdad",
    insightsTitle: "Insikter",
    insightsAnalyzing: "Letar efter något värt en titt…",
    insightsAllClear: "Inget ovanligt stack ut den här månaden.",
    insightsAiNote: "Skrivet av AI",
    anomalyMixedCurrencies: (n: number) =>
      `Intäkterna kom in i ${n} valutor. Totalsumman ovan visar bara den huvudsakliga.`,
    anomalyDuplicateAmount: (amount: string, currency: string, n: number) =>
      `Samma belopp (${amount} ${currency}) förekommer på ${n} rader. Värt att snabbt kontrollera en dubblett.`,
    anomalyLargeOutlier: (amount: string, currency: string, n: number) =>
      n > 1
        ? `${n} rader är mycket större än en typisk rad (upp till ${amount} ${currency}).`
        : `En rad (${amount} ${currency}) är mycket större än en typisk rad.`,
    anomalyRows: (rows: string) => `rad ${rows}`,
  },
  ads: {
    title: "Annonsfakturor",
    desc: "Ladda upp WorldFirst-kontoutdraget och TikTok-fakturorna (PDF). Plattformen matchar dem, flaggar allt som saknas på någon sida och döper om varje faktura redo att arkiveras.",
    statementLabel: "WorldFirst-kontoutdrag",
    statementHint: "PDF-kontoutdraget med annonsbetalningar (en fil)",
    invoicesLabel: "Faktura-PDF:er",
    invoicesHint: "Släpp TikTok-fakturorna (en eller flera)",
    clear: "Rensa",
    reconcile: (n: number) => (n > 0 ? `Stäm av ${n} faktura${n > 1 ? "or" : ""}` : "Stäm av"),
    addBoth: "Lägg till kontoutdraget och minst en faktura.",
    workingTitle: "Läser kontoutdraget och fakturorna…",
    workingSub: "Hämtar varje summa och matchar på belopp och datum.",
    reconciliation: "Avstämning",
    matched: "matchade",
    paymentsNoInvoiceShort: "betalningar utan faktura",
    invoicesNoPaymentShort: "fakturor utan betalning",
    fullyReconciled: "Helt avstämd",
    needsLook: "Behöver granskas",
    invoicesTotal: (n: number) => `Fakturor totalt (${n})`,
    statementTotal: "Kontoutdrag totalt",
    difference: "Differens",
    bMatched: "Matchade",
    bPaymentsNoInvoice: "Betalningar utan faktura",
    bInvoicesNoPayment: "Fakturor utan betalning",
    bUnreadable: "Kunde inte läsas",
    paidOn: (d: string) => `betald ${d}`,
    invoiceMissing: "faktura saknas",
    noMatchingPayment: "ingen matchande betalning",
    readByAi: "Läst av AI, bekräfta beloppet",
    downloadZip: "Ladda ner omdöpta fakturor (.zip)",
    preparing: "Förbereder…",
    zipNote:
      "Zip-filen speglar Drive-strukturen (Accounting / månad / Tiktok). Eller arkivera direkt till Google Drive med knappen ovan.",
    toastDownloaded: "Omdöpta fakturor nedladdade",
    toastDownloadedDesc: "Mapparna speglar Drive-strukturen.",
    fileToDrive: "Arkivera till Google Drive",
    filing: "Arkiverar…",
    filedTitle: (u: number) => `Arkiverade ${u} faktura${u !== 1 ? "or" : ""} till Google Drive`,
    filedDesc: (s: number, f: number) =>
      [s > 0 ? `${s} fanns redan` : "", f > 0 ? `${f} misslyckades` : ""].filter(Boolean).join(" · ") ||
      "Arkiverat i Accounting / månad / Tiktok.",
    driveError: "Arkiveringen till Drive misslyckades.",
    slackNotified: "Slack aviserad",
  },
  amazon: {
    title: "Amazon-avgiftsfakturor",
    desc: "Ladda upp skattedokumenten från Amazon Seller Central (ZIP-filen från Tax Document Library, eller PDF:erna). Plattformen läser varje faktura, döper om den och arkiverar den i Google Drive per månad.",
    uploadLabel: "Amazon-fakturor",
    uploadHint: "Släpp ZIP-filen från Tax Document Library eller faktura-PDF:erna",
    clear: "Rensa",
    process: (n: number) => (n > 0 ? `Läs ${n} fil${n > 1 ? "er" : ""}` : "Läs fakturor"),
    addFiles: "Lägg till ZIP-exporten eller minst en PDF.",
    workingTitle: "Läser Amazon-fakturorna…",
    workingSub: "Hämtar varje fakturanummer, datum och summa.",
    summary: "Lästa fakturor",
    invoicesCounted: (n: number) => `${n} faktura${n !== 1 ? "or" : ""} lästa`,
    provisionalNote:
      "Arkiveras som Amazon <Land> <Typ> <CUR> <Summa>, i Amazon-mappen för fakturans månad, under en undermapp per land.",
    colInvoice: "Faktura",
    colCountry: "Land",
    colType: "Typ",
    colDate: "Datum",
    colAmount: "Summa",
    docMerchant: "Merchant",
    docFba: "Fulfillment",
    docCreditMerchant: "Merchant VAT credit",
    docCreditFba: "Fulfillment VAT credit",
    docEpr: "EPR",
    docOther: "Faktura",
    readByAi: "Läst av AI, bekräfta beloppet",
    fileToDrive: "Arkivera till Google Drive",
    filing: "Arkiverar…",
    downloadZip: "Ladda ner omdöpta (.zip)",
    preparing: "Förbereder…",
    zipNote:
      "Zip-filen speglar Drive-strukturen (Accounting / månad / Amazon). Eller arkivera direkt till Google Drive med knappen ovan.",
    bUnreadable: "Kunde inte läsas",
    filedTitle: (u: number) => `Arkiverade ${u} faktura${u !== 1 ? "or" : ""} till Google Drive`,
    filedDesc: (s: number, f: number) =>
      [s > 0 ? `${s} fanns redan` : "", f > 0 ? `${f} misslyckades` : ""].filter(Boolean).join(" · ") ||
      "Arkiverat i Accounting / månad / Amazon.",
    filedResultTitle: "Arkiveringsresultat",
    filedReceived: (n: number) => `${n} mottagna`,
    filedUploaded: (n: number) => `${n} arkiverade`,
    filedSkipped: (n: number) => `${n} fanns redan`,
    filedFailed: (n: number) => `${n} kunde inte arkiveras`,
    filedComplete: "Alla mottagna fakturor är redovisade.",
    filedIncomplete:
      "Vissa fakturor arkiverades inte. Kontrollera listan nedan och kör igen för att fylla luckorna (redan arkiverade hoppas över).",
    sizeWarn: (mb: string) =>
      `Uppladdningen är ${mb} MB. Uppladdningar över cirka 4,5 MB kan avvisas innan de når servern. Ladda upp Tax Document Library ZIP (mindre), eller dela upp i två uppladdningar.`,
    driveError: "Arkiveringen till Drive misslyckades.",
    toastDownloaded: "Omdöpta fakturor nedladdade",
  },
};

export const messages: Record<Lang, Messages> = { en, sv };

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "sv";
}
