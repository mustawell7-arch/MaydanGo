import { useGetPublicLegalPolicyVersion } from "@workspace/api-client-react";

export type LegalPolicyKey =
  | "terms_of_use"
  | "privacy_policy"
  | "booking_policy"
  | "cancellation_policy"
  | "refund_policy";
type Language = "en" | "ar" | "ku";

const copy: Record<Language, {
  back: string;
  version: string;
  effective: string;
  loading: string;
  unavailable: string;
}> = {
  en: {
    back: "Back to legal information",
    version: "Version",
    effective: "Effective date",
    loading: "Loading the policy…",
    unavailable: "This published policy version is not available.",
  },
  ar: {
    back: "العودة إلى المعلومات القانونية",
    version: "الإصدار",
    effective: "تاريخ السريان",
    loading: "جارٍ تحميل السياسة…",
    unavailable: "إصدار السياسة المنشور هذا غير متاح.",
  },
  ku: {
    back: "گەڕانەوە بۆ زانیاریی یاسایی",
    version: "وەشان",
    effective: "بەرواری جێبەجێبوون",
    loading: "سیاسەت بار دەکرێت…",
    unavailable: "ئەم وەشانە بڵاوکراوەی سیاسەت بەردەست نییە.",
  },
};

export function PolicyDocumentPage({
  policyKey,
  language,
}: {
  policyKey: string;
  language: Language;
}) {
  const isValidKey = ["terms_of_use", "privacy_policy", "booking_policy", "cancellation_policy", "refund_policy"].includes(policyKey);
  const version = typeof window === "undefined"
    ? undefined
    : new URLSearchParams(window.location.search).get("version") ?? undefined;
  const query = useGetPublicLegalPolicyVersion(
    policyKey as LegalPolicyKey,
    version ? { version } : undefined,
    { query: { enabled: isValidKey } },
  );
  const text = copy[language];
  const rtl = language !== "en";

  return (
    <main dir={rtl ? "rtl" : "ltr"} className="mx-auto max-w-4xl px-5 py-10 text-[#173d35] sm:py-16">
      {query.isLoading ? (
        <p role="status" className="rounded-2xl border border-[#dfdacb] bg-[#fffdf7] p-6 text-sm">{text.loading}</p>
      ) : query.isError || !query.data ? (
        <section className="rounded-2xl border border-[#e1c6b6] bg-[#fff5f1] p-6" role="alert">
          <p className="text-sm leading-6">{text.unavailable}</p>
        </section>
      ) : (() => {
        const content = query.data.translations[language];
        return (
          <article className="overflow-hidden rounded-3xl border border-[#dfdacb] bg-[#fffdf7]">
            <header className="bg-[#174d43] p-6 text-[#fff9e9] sm:p-10">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#efaa83]">MaydanGo</p>
              <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{content.title}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[#e3eee7] sm:text-base">{content.introduction}</p>
              <p className="mt-5 text-xs text-[#e3eee7]">
                {text.version}: {query.data.version} · {text.effective}: {new Intl.DateTimeFormat(language === "ku" ? "ckb-IQ" : language === "ar" ? "ar-IQ" : "en-IQ", { dateStyle: "long" }).format(new Date(query.data.effectiveAt))}
              </p>
            </header>
            <div className="space-y-4 p-6 sm:p-10">
              {content.body.split(/\n\s*\n/).map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 20)}`} className="whitespace-pre-wrap text-sm leading-7 text-[#536b61] sm:text-base">{paragraph}</p>
              ))}
            </div>
          </article>
        );
      })()}
      <a href="/legal" className="mt-7 inline-flex text-sm font-bold text-[#174d43] underline underline-offset-4">{text.back}</a>
    </main>
  );
}
