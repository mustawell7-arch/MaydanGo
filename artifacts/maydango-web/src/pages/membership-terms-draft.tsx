import { Link } from "wouter";

const draftVersion = "draft-0.1";

const sections = [
  {
    title: "1. About this draft",
    paragraphs: [
      "This is an English working draft for discussion. It is not an approved agreement, is not active, and must not be treated as an acceptance request. It does not replace any current published terms or privacy notice, change membership access, or alter consent records.",
      "Maydango and qualified Iraqi legal counsel must review the final wording and the commercial details before this document can be approved or used.",
    ],
  },
  {
    title: "2. The Maydango membership",
    paragraphs: [
      "Maydango is intended to help members discover and use participating gyms, sports clubs, swimming pools, events, online sports classes, recorded training, and online coaching through one account and membership.",
      "The activities available to a member depend on the published membership plan, the member’s location, partner participation, capacity, and the details shown for each offering. Not every service is available in every city or at every time.",
    ],
  },
  {
    title: "3. Access, bookings, and attendance",
    paragraphs: [
      "Some activities may be open access; others may require a reservation or partner approval. Members should review the activity details and access requirements before making a booking.",
      "A reservation and an attendance record are separate. A booking alone does not confirm that a visit took place. The app’s check-in process and any required partner confirmation determine whether attendance is recorded.",
      "Eligibility, visit allowances, facility rules, and availability may differ by plan and activity. Final rules will be described in the approved agreement and the relevant offering details.",
    ],
  },
  {
    title: "4. Age and guardian consent",
    paragraphs: [
      "The intended minimum age for membership is 18. A person under 18 may participate only with parent or legal-guardian consent, verified by the participating partner at the venue.",
      "Maydango does not collect guardian details through this draft process. The final age and consent procedure requires review before it is put into effect.",
    ],
  },
  {
    title: "5. Respectful and safe participation",
    paragraphs: [
      "Members are expected to respect other members, partner staff, instructors, facility rules, and the access requirements shown for an activity. Members should not share account access or use another person’s membership.",
      "Follow the partner’s safety instructions and ask staff for help if an activity or facility condition appears unsafe. Members should consider their own circumstances and seek appropriate professional advice when needed before taking part in physical activity.",
    ],
  },
  {
    title: "6. Account care and support",
    paragraphs: [
      "Members should keep their sign-in details private and contact Maydango if they believe their account has been accessed without permission.",
      "For general enquiries, contact maydangoing@gmail.com. Formal notices and any additional support procedures remain to be confirmed.",
    ],
  },
];

const itemsToConfirm = [
  "The registered legal operator name and formal contact details.",
  "Membership prices, billing, renewal, pause, and cancellation terms.",
  "Refunds, credits, taxes, and other charges.",
  "Liability, complaints, dispute handling, and governing-law wording.",
  "The final review, approval, publication, and member-acceptance process.",
];

export default function MembershipTermsDraftPage() {
  const requestedVersion = new URLSearchParams(window.location.search).get("version");
  const isAvailable = requestedVersion === null || requestedVersion === draftVersion;

  return (
    <main lang="en" className="mx-auto max-w-4xl px-5 py-10 text-[#173d35] sm:py-16">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="font-display text-lg font-extrabold text-[#174d43]">Maydango</Link>
        <Link href="/account" className="text-sm font-semibold text-[#174d43] underline underline-offset-4">Back to member account</Link>
      </header>

      {!isAvailable ? (
        <section role="alert" className="rounded-2xl border border-[#e1c6b6] bg-[#fff5f1] p-6">
          <h1 className="font-display text-2xl font-bold">Draft version not available</h1>
          <p className="mt-3 text-sm leading-6">The requested membership terms draft version is not available.</p>
          <Link href="/membership-terms-draft?version=draft-0.1" className="mt-4 inline-flex text-sm font-bold underline">Open draft version draft-0.1</Link>
        </section>
      ) : (
        <>
          <section role="note" className="mb-6 rounded-xl border border-[#e5c78a] bg-[#fff8e7] px-4 py-3 text-sm leading-6 text-[#6e4b13]">
            <strong>Working draft — not active and not for acceptance.</strong> This page is general information, not legal advice. It requires review by the Maydango owner and qualified Iraqi legal counsel. Arabic and Kurdish translations are deferred to the final language review.
          </section>

          <article className="overflow-hidden rounded-3xl border border-[#dfdacb] bg-[#fffdf7]">
            <header className="bg-[#174d43] p-6 text-[#fff9e9] sm:p-10">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#efaa83]">Membership agreement · English draft</p>
              <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Maydango Membership Terms</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[#e3eee7] sm:text-base">
                A proposed outline of the membership relationship. No member acceptance is collected, and this draft does not activate service or commercial terms.
              </p>
              <p className="mt-5 text-xs text-[#e3eee7]">Version: {draftVersion} · Status: Draft for owner and legal review</p>
            </header>

            <div className="space-y-8 p-6 sm:p-10">
              {sections.map(section => (
                <section key={section.title} aria-labelledby={`membership-draft-${section.title.slice(0, 1)}`}>
                  <h2 id={`membership-draft-${section.title.slice(0, 1)}`} className="font-display text-xl font-bold">{section.title}</h2>
                  <div className="mt-3 space-y-3">
                    {section.paragraphs.map(paragraph => <p key={paragraph} className="text-sm leading-7 text-[#536b61] sm:text-base">{paragraph}</p>)}
                  </div>
                </section>
              ))}

              <section aria-labelledby="membership-draft-open-items">
                <h2 id="membership-draft-open-items" className="font-display text-xl font-bold">7. Items still requiring approval</h2>
                <p className="mt-3 text-sm leading-7 text-[#536b61]">The following matters are deliberately left open. No term is implied while it remains unconfirmed.</p>
                <ul className="mt-3 list-disc space-y-2 ps-6 text-sm leading-7 text-[#536b61] sm:text-base">
                  {itemsToConfirm.map(item => <li key={item}>{item}</li>)}
                </ul>
              </section>

              <section className="rounded-xl border border-[#e1dccf] bg-[#f8f6ef] p-4 text-sm leading-6 text-[#536b61]" aria-label="Draft status">
                This document is not a published policy and is not part of the current Terms of Use acceptance flow. It must not be used to approve bookings, collect payment, or change member rights.
              </section>
            </div>
          </article>
        </>
      )}

      <nav aria-label="Legal information" className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[#174d43]">
        <Link href="/legal" className="underline underline-offset-4">Current legal information</Link>
        <Link href="/privacy" className="underline underline-offset-4">Privacy information</Link>
        <Link href="/contact" className="underline underline-offset-4">Contact Maydango</Link>
      </nav>
    </main>
  );
}
