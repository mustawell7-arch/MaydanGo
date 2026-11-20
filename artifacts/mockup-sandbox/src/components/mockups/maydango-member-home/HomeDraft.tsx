import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Dumbbell,
  Globe2,
  MapPin,
  Menu,
  Play,
  QrCode,
  Sparkles,
  Ticket,
  UserRound,
  Video,
  Waves,
} from "lucide-react";

const facilities = [
  { name: "Tigris Movement Studio", detail: "Basra · Al Ashar", type: "Strength · Mobility", mark: "TM", tint: "mint" },
  { name: "Northside Swim Club", detail: "Erbil · Ankawa", type: "Pool · Family hours", mark: "NS", tint: "ochre" },
  { name: "Al Riwaq Fitness", detail: "Ramadi · Anbar", type: "Gym · Open today", mark: "AR", tint: "rose" },
];

function SectionTitle({ eyebrow, title, action, onAction }: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mg-section-heading">
      <div>
        {eyebrow && <div className="mg-eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {action && <button className="mg-text-action" onClick={onAction}>{action}<ArrowRight size={14} /></button>}
    </div>
  );
}

export function HomeDraft() {
  const [languageOpen, setLanguageOpen] = useState(false);
  const language = "English";
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("Home");

  const goTo = (id: string) => {
    document.getElementById(`mg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="maydan-home">
      <style>{`
        .maydan-home {
          --mg-ink:#1c312d; --mg-green:#266457; --mg-bg:#f7f5ee; --mg-paper:#fcfbf7;
          --mg-muted:#657770; --mg-line:#e3dfd5; --mg-orange:#f19c5f; --mg-yellow:#f4db90;
          width:100%; height:100%; min-height:100dvh; overflow:hidden; display:flex; flex-direction:column;
          color:var(--mg-ink); background:var(--mg-bg); font-family:'DM Sans',sans-serif; position:relative;
        }
        .maydan-home * { box-sizing:border-box; }
        .mg-scroll { overflow-y:auto; flex:1; padding:0 20px 22px; scrollbar-width:none; }
        .mg-scroll::-webkit-scrollbar { display:none; }
        .mg-top { display:flex; justify-content:space-between; align-items:center; padding:19px 0 17px; }
        .mg-brand { display:flex; align-items:center; gap:10px; }
        .mg-brand-mark { width:37px;height:37px;border-radius:13px;background:var(--mg-green);color:#f7f5ee;display:grid;place-items:center; }
        .mg-brand-mark svg { stroke-width:1.8; }
        .mg-brand-name { font:800 16px 'Manrope',sans-serif; letter-spacing:-.55px; line-height:1.05; }
        .mg-city { border:0;background:none;padding:4px 0 0;display:flex;align-items:center;gap:4px;color:var(--mg-muted);font-size:11px;cursor:pointer; }
        .mg-top-actions { display:flex;align-items:center;gap:9px; }
        .mg-language-wrap { position:relative; }
        .mg-language { display:flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--mg-line);border-radius:999px;padding:8px 9px;color:var(--mg-ink);font-size:11px;font-weight:700;cursor:pointer; }
        .mg-lang-menu { position:absolute;z-index:5;right:0;top:40px;width:147px;padding:6px;background:var(--mg-paper);border:1px solid var(--mg-line);border-radius:13px;box-shadow:0 12px 26px #1c312d1a; }
        .mg-lang-option { width:100%;padding:9px 8px;border:0;background:transparent;color:var(--mg-ink);display:flex;justify-content:space-between;font:600 12px 'DM Sans',sans-serif;border-radius:8px;cursor:pointer; }
        .mg-lang-option:hover { background:#f1efe7; }
        .mg-scan { height:37px;width:37px;border-radius:12px;border:0;color:#f7f5ee;background:var(--mg-green);display:grid;place-items:center;cursor:pointer; }
        .mg-locale-note { margin:-8px 0 13px;display:flex;align-items:flex-start;gap:6px;color:#797c70;font-size:9px;line-height:1.4; }
        .mg-locale-note b { font-weight:700;color:#58665d; }
        .mg-intro { padding:8px 0 18px; }
        .mg-region { font-size:9px;letter-spacing:1.35px;color:var(--mg-muted);font-weight:700; }
        .mg-greeting { font:800 27px/1.08 'Manrope',sans-serif;letter-spacing:-1.25px;margin:8px 0 3px; }
        .mg-greeting-accent { font:700 19px/1.25 'Manrope',sans-serif;color:var(--mg-green);letter-spacing:-.45px; }
        .mg-intro-sub { font-size:11px;color:var(--mg-muted);margin:8px 0 0; }
        .mg-pass { position:relative;overflow:hidden;background:var(--mg-green);color:#f7f5ee;border-radius:20px;padding:17px 17px 15px;margin:0 0 20px; }
        .mg-pass:after { content:"";position:absolute;width:154px;height:154px;right:-74px;top:-92px;border:1px solid #e6eee01c;border-radius:50%;box-shadow:0 0 0 18px #e6eee00b,0 0 0 38px #e6eee009; }
        .mg-pass-top { display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1; }
        .mg-pass-label { font-size:9px;letter-spacing:1.45px;text-transform:uppercase;font-weight:700;color:#d2e2d9; }
        .mg-pass-symbol { width:27px;height:27px;border-radius:9px;background:#f4db9027;display:grid;place-items:center;color:var(--mg-yellow); }
        .mg-pass h2 { font:800 20px 'Manrope',sans-serif;letter-spacing:-.6px;margin:10px 0 3px;position:relative;z-index:1; }
        .mg-pass p { color:#d7e4dc;font-size:10px;margin:0;position:relative;z-index:1;line-height:1.45; }
        .mg-pass-bottom { border-top:1px solid #ffffff2b;margin-top:13px;padding-top:10px;display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1; }
        .mg-preview-tag { display:flex;gap:6px;align-items:center;font-size:9px;color:#e0e9e2; }
        .mg-preview-tag span { width:6px;height:6px;border-radius:50%;background:var(--mg-yellow); }
        .mg-pass-more { border:0;background:transparent;color:var(--mg-yellow);font-size:10px;font-weight:700;display:flex;align-items:center;gap:4px;cursor:pointer; }
        .mg-section-heading { display:flex;justify-content:space-between;align-items:flex-end;margin:21px 0 10px;scroll-margin-top:10px; }
        .mg-eyebrow { color:var(--mg-muted);font-size:9px;letter-spacing:1.1px;font-weight:700;text-transform:uppercase;margin-bottom:4px; }
        .mg-section-heading h2 { font:800 17px/1.15 'Manrope',sans-serif;letter-spacing:-.55px;margin:0; }
        .mg-text-action { border:0;background:transparent;color:var(--mg-green);font:700 10px 'DM Sans',sans-serif;display:flex;align-items:center;gap:3px;padding:0 0 2px;cursor:pointer;white-space:nowrap; }
        .mg-empty-booking { background:#f2e9d9;border-radius:16px;padding:13px;display:flex;gap:11px;align-items:center; }
        .mg-icon-tile { height:38px;width:38px;flex:none;border-radius:12px;background:var(--mg-orange);display:grid;place-items:center;color:#214d43; }
        .mg-empty-copy { flex:1;min-width:0; }
        .mg-empty-copy strong { display:block;font:700 12px 'Manrope',sans-serif; }
        .mg-empty-copy span { display:block;color:#6b766b;font-size:10px;margin-top:3px;line-height:1.35; }
        .mg-small-cta { border:0;background:var(--mg-green);color:#fffaf0;padding:8px 9px;border-radius:9px;font-size:9px;font-weight:700;cursor:pointer;white-space:nowrap; }
        .mg-live-card { margin-top:9px;display:flex;align-items:center;gap:11px;padding:12px;border-radius:15px;border:1px solid var(--mg-line);background:var(--mg-paper); }
        .mg-live-icon { width:38px;height:38px;border-radius:12px;background:#e7eee3;display:grid;place-items:center;color:var(--mg-green); }
        .mg-live-copy { flex:1; }
        .mg-live-kicker { display:flex;align-items:center;gap:5px;color:var(--mg-green);font-size:9px;font-weight:700; }
        .mg-live-kicker i { width:5px;height:5px;border-radius:50%;background:#e08a57; }
        .mg-live-title { font:700 12px 'Manrope',sans-serif;margin:4px 0 2px; }
        .mg-live-time { font-size:9px;color:var(--mg-muted);display:flex;align-items:center;gap:4px; }
        .mg-course { border-radius:16px;background:#f2e9d9;padding:12px;display:flex;align-items:center;gap:11px; }
        .mg-course-stamp { height:49px;width:49px;border-radius:14px;background:#f4db90;display:grid;place-items:center;color:#345f50;position:relative; }
        .mg-course-stamp:after { content:"";position:absolute;inset:6px;border:1px solid #26645735;border-radius:10px; }
        .mg-course-main { flex:1;min-width:0; }
        .mg-course-main strong { font:700 12px 'Manrope',sans-serif;display:block; }
        .mg-course-main small { display:block;color:var(--mg-muted);font-size:9px;margin-top:3px; }
        .mg-progress { height:4px;border-radius:5px;background:#d9d2c1;margin:8px 0 4px;overflow:hidden; }
        .mg-progress span { display:block;width:42%;height:100%;background:var(--mg-green);border-radius:5px; }
        .mg-progress-label { font-size:8px;color:#5e7068; }
        .mg-course-play { height:29px;width:29px;border:0;border-radius:50%;background:var(--mg-green);color:#fff;display:grid;place-items:center;cursor:pointer; }
        .mg-checkin-tip { margin-top:9px;border:1px solid #e5e0d6;border-radius:13px;padding:10px;display:flex;align-items:center;gap:9px;background:#fbfaf6; }
        .mg-checkin-tip svg { color:var(--mg-green);flex:none; }
        .mg-checkin-tip div { flex:1;font-size:10px;font-weight:700; }
        .mg-checkin-tip small { display:block;font-weight:400;color:var(--mg-muted);font-size:9px;margin-top:2px; }
        .mg-facility-row { display:flex;gap:9px;overflow-x:auto;margin:0 -20px;padding:0 20px 4px;scrollbar-width:none; }
        .mg-facility-row::-webkit-scrollbar { display:none; }
        .mg-facility { flex:0 0 204px;border:1px solid var(--mg-line);background:var(--mg-paper);border-radius:15px;padding:10px; }
        .mg-facility-top { display:flex;align-items:center;justify-content:space-between;margin-bottom:10px; }
        .mg-facility-monogram { width:32px;height:32px;border-radius:11px;display:grid;place-items:center;font:800 9px 'Manrope',sans-serif;letter-spacing:.3px; }
        .mg-facility-monogram.mint { background:#dfece3;color:#266457; }
        .mg-facility-monogram.ochre { background:#f5e7bd;color:#735f28; }
        .mg-facility-monogram.rose { background:#f3e1d6;color:#82583c; }
        .mg-open { font-size:8px;color:#477064;background:#e8f0e9;border-radius:999px;padding:4px 6px;font-weight:700; }
        .mg-facility strong { display:block;font:700 11px 'Manrope',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
        .mg-facility-detail { color:var(--mg-muted);font-size:9px;margin-top:4px; }
        .mg-facility-type { border-top:1px solid #eeeae2;margin-top:8px;padding-top:7px;color:#4f6d61;font-size:8px; }
        .mg-event { padding:11px 0;border-bottom:1px solid var(--mg-line);display:flex;align-items:center;gap:11px; }
        .mg-date-box { width:42px;height:44px;flex:none;border-radius:11px;background:#e7eee3;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--mg-green); }
        .mg-date-box b { font:800 15px 'Manrope',sans-serif;line-height:1; }
        .mg-date-box span { font-size:8px;font-weight:700;letter-spacing:.7px;margin-top:3px; }
        .mg-event-copy { flex:1; }
        .mg-event-copy strong { display:block;font:700 11px 'Manrope',sans-serif; }
        .mg-event-copy small { display:block;color:var(--mg-muted);font-size:9px;margin-top:4px; }
        .mg-event-label { display:flex;align-items:center;gap:4px;color:#68776c;background:#f0eee7;padding:5px 6px;border-radius:7px;font-size:8px;font-weight:700; }
        .mg-featured { margin:16px 0 7px;border-radius:16px;background:#e5ede6;padding:13px;display:flex;gap:11px;align-items:center; }
        .mg-featured-icon { width:40px;height:40px;border-radius:13px;background:#c7dbcf;color:var(--mg-green);display:grid;place-items:center; }
        .mg-featured-copy { flex:1; }
        .mg-featured-copy small { display:block;color:#60786a;font-size:8px;letter-spacing:.8px;text-transform:uppercase;font-weight:700; }
        .mg-featured-copy strong { display:block;font:700 11px 'Manrope',sans-serif;margin:4px 0 2px; }
        .mg-featured-copy span { color:var(--mg-muted);font-size:9px; }
        .mg-notice { position:absolute;z-index:8;bottom:78px;left:50%;transform:translateX(-50%);background:#1c312d;color:#f9f7f1;padding:10px 14px;border-radius:12px;font-size:11px;box-shadow:0 8px 24px #16272430;white-space:nowrap; }
        .mg-bottom { flex:none;display:flex;justify-content:space-around;align-items:center;padding:9px 9px max(12px, env(safe-area-inset-bottom));background:#fcfbf7;border-top:1px solid var(--mg-line); }
        .mg-tab { border:0;background:transparent;display:flex;align-items:center;flex-direction:column;gap:3px;min-width:54px;padding:2px;color:#87928b;font:600 8px 'DM Sans',sans-serif;cursor:pointer; }
        .mg-tab.active { color:var(--mg-green); }
        .mg-tab.active svg { stroke-width:2.3; }
        @media (min-width:500px) {
          .maydan-home { max-width:390px;min-height:844px;height:844px;margin:0 auto;border:1px solid #ddd9cf; }
        }
      `}</style>

      <div className="mg-scroll">
        <header className="mg-top">
          <div className="mg-brand">
            <div className="mg-brand-mark"><Dumbbell size={20} /></div>
            <div>
              <div className="mg-brand-name">MaydanGo</div>
              <button className="mg-city" onClick={() => setNotice("City selector · sample location: Baghdad")}>
                <MapPin size={11} /> Baghdad, Iraq <ChevronDown size={11} />
              </button>
            </div>
          </div>
          <div className="mg-top-actions">
            <div className="mg-language-wrap">
              <button className="mg-language" onClick={() => setLanguageOpen(!languageOpen)} aria-expanded={languageOpen}>
                <Globe2 size={13} /> {language} <ChevronDown size={12} />
              </button>
              {languageOpen && <div className="mg-lang-menu">
                {["English", "Arabic", "Kurdish (Sorani)"].map((item) => (
                  <button className="mg-lang-option" key={item} onClick={() => {
                    setLanguageOpen(false);
                    if (item !== "English") setNotice("Arabic and Sorani translation is not available in this English-only design draft.");
                  }}>
                    {item}{language === item && <Check size={13} />}
                  </button>
                ))}
              </div>}
            </div>
            <button className="mg-scan" aria-label="Scan to check in" onClick={() => setNotice("Check-in preview · no scan is being recorded")}><QrCode size={19} /></button>
          </div>
        </header>
        <div className="mg-locale-note"><CircleHelp size={11} /><span><b>English screen draft.</b> Arabic and Sorani Kurdish appear as options only; translated copy is not final.</span></div>

        <section className="mg-intro">
          <div className="mg-region">IRAQ · KURDISTAN · NORTH · SOUTH · WEST</div>
          <h1 className="mg-greeting">Good morning</h1>
          <div className="mg-greeting-accent">Make room for feeling good.</div>
          <p className="mg-intro-sub">A little movement, in a way that works for you.</p>
        </section>

        <section className="mg-pass">
          <div className="mg-pass-top">
            <div className="mg-pass-label">Your membership</div>
            <div className="mg-pass-symbol"><Sparkles size={15} /></div>
          </div>
          <h2>Find your way in</h2>
          <p>Explore gyms, pools, clubs and classes across Iraq.</p>
          <div className="mg-pass-bottom">
            <div className="mg-preview-tag"><span /> Illustrative preview · no active entitlement</div>
            <button className="mg-pass-more" onClick={() => setNotice("Membership details are illustrative in this review draft.")}>Details <ChevronRight size={13} /></button>
          </div>
        </section>

        <section id="mg-bookings">
          <SectionTitle eyebrow="Your plans" title="Coming up" action="Bookings" onAction={() => setNotice("Bookings screen is outside this one-screen draft.")} />
          <div className="mg-empty-booking">
            <div className="mg-icon-tile"><CalendarDays size={19} /></div>
            <div className="mg-empty-copy"><strong>No upcoming bookings</strong><span>Find a class or activity that fits your day.</span></div>
            <button className="mg-small-cta" onClick={() => goTo("nearby")}>Explore</button>
          </div>
          <div className="mg-live-card">
            <div className="mg-live-icon"><Video size={19} /></div>
            <div className="mg-live-copy">
              <div className="mg-live-kicker"><i /> NEXT LIVE CLASS · SAMPLE</div>
              <div className="mg-live-title">Gentle mobility</div>
              <div className="mg-live-time"><Clock3 size={11} /> Today, 6:00 PM · Online</div>
            </div>
            <ChevronRight size={17} color="#718079" />
          </div>
        </section>

        <section id="mg-learning">
          <SectionTitle eyebrow="Online training" title="Pick up where you left off" action="See all" onAction={() => setNotice("Online training is outside this one-screen draft.")} />
          <div className="mg-course">
            <div className="mg-course-stamp"><Waves size={22} /></div>
            <div className="mg-course-main">
              <strong>Everyday mobility</strong><small>Coach Dalia · 3 of 7 lessons</small>
              <div className="mg-progress"><span /></div><div className="mg-progress-label">Illustrative progress · 42%</div>
            </div>
            <button className="mg-course-play" aria-label="Continue illustrative course" onClick={() => setNotice("Sample course preview · access is not verified.")}><Play size={13} fill="currentColor" /></button>
          </div>
          <div className="mg-checkin-tip"><QrCode size={18} /><div>At the door? Scan to check in.<small>A reservation is not an attendance record.</small></div><ArrowDown size={14} /></div>
        </section>

        <section id="mg-nearby">
          <SectionTitle eyebrow="Find your fit" title="Nearby places" action="Explore all" onAction={() => setNotice("Explore is outside this one-screen draft.")} />
          <p style={{ margin: "-4px 0 10px", color: "var(--mg-muted)", fontSize: 10 }}>Different spaces for different ways to move.</p>
          <div className="mg-facility-row">
            {facilities.map((facility) => (
              <article className="mg-facility" key={facility.name}>
                <div className="mg-facility-top"><div className={`mg-facility-monogram ${facility.tint}`}>{facility.mark}</div><span className="mg-open">Sample place</span></div>
                <strong>{facility.name}</strong><div className="mg-facility-detail">{facility.detail}</div><div className="mg-facility-type">{facility.type}</div>
              </article>
            ))}
          </div>
        </section>

        <section id="mg-events">
          <SectionTitle eyebrow="Out and about" title="Upcoming events" action="See all" onAction={() => setNotice("Events discovery is outside this one-screen draft.")} />
          <div className="mg-event">
            <div className="mg-date-box"><b>28</b><span>NOV</span></div>
            <div className="mg-event-copy"><strong>Baghdad City 5K</strong><small>Sat · 7:00 AM · sample listing</small></div>
            <span className="mg-event-label"><Ticket size={11} /> Event</span>
          </div>
          <div className="mg-event">
            <div className="mg-date-box" style={{ background: "#f4e8ce", color: "#796136" }}><b>2</b><span>DEC</span></div>
            <div className="mg-event-copy"><strong>Open pool morning</strong><small>Wed · 9:30 AM · Erbil · sample</small></div>
            <span className="mg-event-label"><Waves size={11} /> Pool</span>
          </div>
        </section>

        <section className="mg-featured">
          <div className="mg-featured-icon"><Sparkles size={19} /></div>
          <div className="mg-featured-copy"><small>Featured course · sample</small><strong>Build a steady movement habit</strong><span>With instructor Noor · 5 short lessons</span></div>
          <ChevronRight size={16} color="#526b5f" />
        </section>
        <div style={{ height: 8 }} />
      </div>

      {notice && <button className="mg-notice" onClick={() => setNotice("")}>{notice} <span style={{ marginLeft: 8, opacity: .7 }}>×</span></button>}
      <nav className="mg-bottom" aria-label="Main navigation">
        {[
          { label: "Home", icon: Menu }, { label: "Explore", icon: Compass }, { label: "Bookings", icon: CalendarDays },
          { label: "Online", icon: Play }, { label: "Profile", icon: UserRound },
        ].map(({ label, icon: Icon }) => (
          <button className={`mg-tab ${activeTab === label ? "active" : ""}`} key={label} onClick={() => {
            setActiveTab(label);
            if (label !== "Home") setNotice(`${label} is not part of this Home-screen draft.`);
          }}>
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
