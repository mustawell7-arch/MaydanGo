import { useEffect, useState, type FormEvent } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useGetMemberAccountSummary } from "@workspace/api-client-react";
import { Link, Redirect } from "wouter";

type Language = "en" | "ar" | "ku";

const copy: Record<Language, Record<string, string>> = {
  en: {
    title: "Your MaydanGo account",
    intro: "Review your membership and bookings, update your name, or find help.",
    profile: "Account details",
    firstName: "First name",
    lastName: "Last name",
    email: "Email address",
    save: "Save name",
    saving: "Saving…",
    profileSaved: "Your name was updated.",
    profileError: "We could not update your name. Please try again.",
    membership: "Membership",
    plans: "View membership plans",
    noMembership: "No membership is linked to this account yet.",
    previewMembership: "Sample preview only — this does not grant live access.",
    tier: "Plan",
    status: "Status",
    ends: "Ends",
    bookings: "Your bookings",
    noBookings: "No bookings are linked to this account yet.",
    booked: "Reserved",
    cancelled: "Cancelled",
    recorded: "Recorded",
    sampleBooking: "Sample record — not a live booking.",
    bookingsError: "We could not load your bookings right now.",
    retry: "Try again",
    loading: "Loading your account…",
    payments: "Invoices and payment history",
    paymentsNote: "These records are not available on the website yet. Membership checkout and payment history remain disabled.",
    mobileTitle: "Use the mobile app for member experiences",
    mobileNote: "The mobile app remains the intended place for QR scanning, GPS check-in, push notifications, live-class participation, and your membership card.",
    help: "Visit Help",
    backToPlans: "Explore plans",
    signIn: "Sign in to view your account",
  },
  ar: {
    title: "حسابك في MaydanGo",
    intro: "راجع عضويتك وحجوزاتك، حدّث اسمك، أو اعثر على المساعدة.",
    profile: "تفاصيل الحساب",
    firstName: "الاسم الأول",
    lastName: "اسم العائلة",
    email: "البريد الإلكتروني",
    save: "حفظ الاسم",
    saving: "جارٍ الحفظ…",
    profileSaved: "تم تحديث اسمك.",
    profileError: "تعذر تحديث اسمك. حاول مرة أخرى.",
    membership: "العضوية",
    plans: "عرض خطط العضوية",
    noMembership: "لا توجد عضوية مرتبطة بهذا الحساب حتى الآن.",
    previewMembership: "معاينة تجريبية فقط — لا تمنح وصولاً فعلياً.",
    tier: "الخطة",
    status: "الحالة",
    ends: "تنتهي",
    bookings: "حجوزاتك",
    noBookings: "لا توجد حجوزات مرتبطة بهذا الحساب حتى الآن.",
    booked: "محجوز",
    cancelled: "ملغى",
    recorded: "مسجل",
    sampleBooking: "سجل تجريبي — ليس حجزاً فعلياً.",
    bookingsError: "تعذر تحميل حجوزاتك الآن.",
    retry: "حاول مرة أخرى",
    loading: "جارٍ تحميل حسابك…",
    payments: "الفواتير وسجل المدفوعات",
    paymentsNote: "هذه السجلات غير متاحة على الموقع حالياً. شراء العضوية وسجل المدفوعات ما زالا غير مفعّلين.",
    mobileTitle: "تجارب الأعضاء في تطبيق الهاتف",
    mobileNote: "يبقى تطبيق الهاتف المكان المقصود لمسح رمز QR وتسجيل الحضور عبر GPS والإشعارات الفورية والمشاركة في الصفوف المباشرة وبطاقة العضوية.",
    help: "زيارة المساعدة",
    backToPlans: "استكشف الخطط",
    signIn: "سجّل الدخول لعرض حسابك",
  },
  ku: {
    title: "هەژماری MaydanGo ـی تۆ",
    intro: "ئەندامێتی و حجزەکانت ببینە، ناوت نوێ بکەرەوە، یان یارمەتی بدۆزەوە.",
    profile: "وردەکاریی هەژمار",
    firstName: "ناوی یەکەم",
    lastName: "ناوی خێزان",
    email: "ئیمەیڵ",
    save: "ناوەکە پاشەکەوت بکە",
    saving: "پاشەکەوت دەکرێت…",
    profileSaved: "ناوەکەت نوێ کرایەوە.",
    profileError: "نەتوانرا ناوەکەت نوێ بکرێتەوە. دووبارە هەوڵ بدەوە.",
    membership: "ئەندامێتی",
    plans: "بینینی پلانەکانی ئەندامێتی",
    noMembership: "هێشتا هیچ ئەندامێتییەک بەستراوەتەوە بەو هەژمارە.",
    previewMembership: "تەنها پێشبینینی نموونەییە — دەستگەیشتنی ڕاستەقینە نادات.",
    tier: "پلان",
    status: "بارودۆخ",
    ends: "کۆتایی دێت",
    bookings: "حجزەکانت",
    noBookings: "هێشتا هیچ حجزێک بەستراوەتەوە بەو هەژمارە.",
    booked: "حجزکراوە",
    cancelled: "هەڵوەشێنراوەتەوە",
    recorded: "تۆمارکراوە",
    sampleBooking: "تۆماری نموونەییە — حجزێکی ڕاستەقینە نییە.",
    bookingsError: "ئێستا نەتوانرا حجزەکانت باربکرێن.",
    retry: "دووبارە هەوڵ بدەوە",
    loading: "هەژمارەکەت بار دەکرێت…",
    payments: "پسووڵە و مێژووی پارەدان",
    paymentsNote: "ئەم تۆمارانە هێشتا لە ماڵپەڕەکە بەردەست نین. کڕینی ئەندامێتی و مێژووی پارەدان ناچالاکن.",
    mobileTitle: "ئەزموونی ئەندامان لە ئەپی مۆبایل",
    mobileNote: "ئەپی مۆبایل شوێنی سەرەکیی پێشنیارکراوە بۆ سکانی QR، حزووری GPS، ئاگادارکردنەوە، بەشداری لە وانەی ڕاستەوخۆ و کارتی ئەندامێتی.",
    help: "سەردانی یارمەتی",
    backToPlans: "پلانەکان ببینە",
    signIn: "بچۆ ژوورەوە بۆ بینینی هەژمارەکەت",
  },
};

const locale: Record<Language, string> = { en: "en-IQ", ar: "ar-IQ", ku: "ckb-IQ" };

function formatIraqDate(value: string, language: Language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale[language], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Baghdad",
  }).format(date);
}

export default function MemberAccountPage({ language }: { language: Language }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const summary = useGetMemberAccountSummary({
    query: { enabled: isLoaded && isSignedIn === true },
  });
  const t = copy[language];
  const rtl = language !== "en";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState(false);

  useEffect(() => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
  }, [user?.id, user?.firstName, user?.lastName]);

  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousContent = existing?.content;
    const robots = existing ?? document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex,nofollow";
    if (!existing) document.head.appendChild(robots);
    return () => {
      if (existing) existing.content = previousContent ?? "";
      else robots.remove();
    };
  }, []);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !firstName.trim()) return;
    setSaving(true);
    setProfileMessage("");
    setProfileError(false);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      await user.reload();
      setProfileMessage(t.profileSaved);
    } catch {
      setProfileMessage(t.profileError);
      setProfileError(true);
    } finally {
      setSaving(false);
    }
  }

  if (!isLoaded || !userLoaded) {
    return <section className="mx-auto max-w-6xl px-5 py-16 text-center" aria-live="polite">{t.loading}</section>;
  }
  if (!isSignedIn) return <Redirect to="/sign-in?redirect_url=%2Faccount" />;

  return (
    <section className={`mx-auto max-w-6xl px-5 py-10 md:py-16 ${rtl ? "text-right" : ""}`} dir={rtl ? "rtl" : "ltr"}>
      <header className="mb-8 max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">MaydanGo</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-foreground md:text-5xl">{t.title}</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{t.intro}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="account-profile-heading">
            <h2 id="account-profile-heading" className="font-display text-2xl font-bold">{t.profile}</h2>
            <form onSubmit={saveName} className="mt-5 space-y-4">
              <label className="block text-sm font-semibold">
                {t.firstName}
                <input className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-normal" value={firstName} onChange={event => setFirstName(event.target.value)} required autoComplete="given-name" />
              </label>
              <label className="block text-sm font-semibold">
                {t.lastName}
                <input className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-normal" value={lastName} onChange={event => setLastName(event.target.value)} autoComplete="family-name" />
              </label>
              <label className="block text-sm font-semibold">
                {t.email}
                <input className="mt-2 w-full rounded-xl border border-border bg-muted px-4 py-3 font-normal text-muted-foreground" value={user?.primaryEmailAddress?.emailAddress ?? ""} readOnly />
              </label>
              <button type="submit" disabled={saving || !firstName.trim()} className="rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? t.saving : t.save}
              </button>
              {profileMessage && <p role={profileError ? "alert" : "status"} className={`text-sm ${profileError ? "text-destructive" : "text-primary"}`}>{profileMessage}</p>}
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="account-membership-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 id="account-membership-heading" className="font-display text-2xl font-bold">{t.membership}</h2>
              <Link href="/membership-plans" className="text-sm font-bold text-primary underline-offset-4 hover:underline">{t.plans}</Link>
            </div>
            {summary.isLoading ? <p className="mt-4 text-sm text-muted-foreground">{t.loading}</p>
              : summary.isError ? <p className="mt-4 text-sm text-destructive" role="alert">{t.bookingsError}</p>
                : summary.data?.memberships.length ? <ul className="mt-5 space-y-3">
                  {summary.data.memberships.map((membership, index) => {
                    const preview = membership.scope === "preview";
                    return <li key={`${membership.scope}-${membership.tier}-${index}`} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{preview ? t.previewMembership : `${t.tier}: ${membership.tier}`}</strong>
                        {!preview && <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{membership.status}</span>}
                      </div>
                      {!preview && <p className="mt-2 text-sm text-muted-foreground">{t.ends}: {formatIraqDate(membership.endsAt, language)}</p>}
                    </li>;
                  })}
                </ul> : <p className="mt-4 text-sm leading-6 text-muted-foreground">{t.noMembership}</p>}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="account-bookings-heading">
            <h2 id="account-bookings-heading" className="font-display text-2xl font-bold">{t.bookings}</h2>
            {summary.isLoading ? <p className="mt-4 text-sm text-muted-foreground">{t.loading}</p>
              : summary.isError ? <div className="mt-4">
                <p className="text-sm text-destructive" role="alert">{t.bookingsError}</p>
                <button type="button" onClick={() => void summary.refetch()} className="mt-3 text-sm font-bold text-primary underline-offset-4 hover:underline">{t.retry}</button>
              </div>
                : summary.data?.bookings.length ? <ul className="mt-5 space-y-3">
                  {[...summary.data.bookings].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).map(booking => {
                    const preview = booking.scope === "preview";
                    const title = booking.localizedTitle?.[language] || booking.title;
                    const status = booking.status.includes("cancel") ? t.cancelled : booking.status === "reserved" ? t.booked : t.recorded;
                    return <li key={booking.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="font-bold">{title}</h3>
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{preview ? t.sampleBooking : status}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{booking.facility} · {booking.city}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{formatIraqDate(booking.startsAt, language)}</p>
                    </li>;
                  })}
                </ul> : <p className="mt-4 text-sm leading-6 text-muted-foreground">{t.noBookings}</p>}
          </section>

          <section className="rounded-2xl border border-border bg-[#f2e8d9] p-5 sm:p-7" aria-labelledby="account-payments-heading">
            <h2 id="account-payments-heading" className="font-display text-xl font-bold">{t.payments}</h2>
            <p className="mt-2 text-sm leading-6">{t.paymentsNote}</p>
          </section>

          <section className="rounded-2xl border border-border bg-primary p-5 text-primary-foreground sm:p-7" aria-labelledby="account-mobile-heading">
            <h2 id="account-mobile-heading" className="font-display text-xl font-bold">{t.mobileTitle}</h2>
            <p className="mt-2 text-sm leading-6 opacity-90">{t.mobileNote}</p>
          </section>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/help" className="rounded-full border border-border bg-card px-5 py-3 text-sm font-bold hover:bg-muted">{t.help}</Link>
        <Link href="/membership-plans" className="rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">{t.backToPlans}</Link>
      </div>
    </section>
  );
}
