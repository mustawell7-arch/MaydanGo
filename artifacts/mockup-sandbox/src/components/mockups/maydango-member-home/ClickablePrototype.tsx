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
  Play,
  QrCode,
  Search,
  Sparkles,
  Ticket,
  UserRound,
  Video,
  Waves,
} from "lucide-react";

type Screen = "Home" | "Explore" | "Bookings" | "Online" | "Profile";
type ExploreMode = "Places" | "Events";
type OnlineMode = "Courses" | "Live classes" | "Coaching";

const places = [
  { name: "Tigris Movement Studio", area: "Al Ashar · Basra", type: "Strength · Mobility", mark: "TM", color: "mint" },
  { name: "Northside Swim Club", area: "Ankawa · Erbil", type: "Pool · Family hours", mark: "NS", color: "gold" },
  { name: "Al Riwaq Fitness", area: "Ramadi · Anbar", type: "Gym · Open today", mark: "AR", color: "peach" },
];

const events = [
  { day: "28", month: "NOV", name: "Baghdad City 5K", detail: "Saturday · 7:00 AM · Baghdad", kind: "5K run" },
  { day: "02", month: "DEC", name: "Open pool morning", detail: "Wednesday · 9:30 AM · Erbil", kind: "Swimming" },
];

function SectionHeading({ eyebrow, title, action, onAction }: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="md-heading">
      <div>
        {eyebrow && <div className="md-eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {action && <button className="md-link" onClick={onAction}>{action}<ArrowRight size={13} /></button>}
    </div>
  );
}

export function ClickablePrototype() {
  const [screen, setScreen] = useState<Screen>("Home");
  const [exploreMode, setExploreMode] = useState<ExploreMode>("Places");
  const [onlineMode, setOnlineMode] = useState<OnlineMode>("Courses");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 3000);
  };

  const navigate = (next: Screen) => {
    setScreen(next);
    setSearch("");
  };

  const filteredPlaces = places.filter((place) =>
    `${place.name} ${place.area} ${place.type}`.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredEvents = events.filter((event) =>
    `${event.name} ${event.detail} ${event.kind}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <main className="md-prototype">
      <style>{`
        .md-prototype {
          --ink:#1c312d; --green:#266457; --bg:#f7f5ee; --paper:#fcfbf7;
          --muted:#657770; --line:#e3dfd5; --orange:#f19c5f; --yellow:#f4db90;
          width:100%; height:100%; min-height:844px; max-width:390px; margin:0 auto; overflow:hidden;
          display:flex; flex-direction:column; position:relative; color:var(--ink); background:var(--bg);
          font-family:'DM Sans',sans-serif; border:1px solid #e6e1d7;
        }
        .md-prototype * { box-sizing:border-box; }
        .md-scroll { flex:1; min-height:0; overflow-y:auto; padding:0 20px 22px; scrollbar-width:none; }
        .md-scroll::-webkit-scrollbar { display:none; }
        .md-top { min-height:69px; display:flex; justify-content:space-between; align-items:center; padding:15px 0 12px; }
        .md-brand { display:flex; align-items:center; gap:10px; }
        .md-mark { width:37px;height:37px;border-radius:13px;background:var(--green);color:#f7f5ee;display:grid;place-items:center; }
        .md-brand-name { font:800 16px 'Manrope',sans-serif;letter-spacing:-.55px;line-height:1.05; }
        .md-city { border:0;background:none;padding:4px 0 0;display:flex;align-items:center;gap:4px;color:var(--muted);font-size:10px;cursor:pointer; }
        .md-actions { display:flex;align-items:center;gap:8px; }
        .md-language-wrap { position:relative; }
        .md-language { display:flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--line);border-radius:999px;padding:8px 9px;color:var(--ink);font-size:10px;font-weight:700;cursor:pointer; }
        .md-language-menu { position:absolute;z-index:5;right:0;top:39px;width:160px;padding:6px;background:var(--paper);border:1px solid var(--line);border-radius:13px;box-shadow:0 12px 26px #1c312d1a; }
        .md-language-option { width:100%;padding:9px 8px;border:0;background:transparent;color:var(--ink);display:flex;justify-content:space-between;font:600 11px 'DM Sans',sans-serif;border-radius:8px;cursor:pointer;text-align:left; }
        .md-language-option:hover { background:#f1efe7; }
        .md-icon-button { height:37px;width:37px;border-radius:12px;border:0;color:#f7f5ee;background:var(--green);display:grid;place-items:center;cursor:pointer; }
        .md-locale-note { margin:-3px 0 12px;display:flex;align-items:flex-start;gap:6px;color:#797c70;font-size:9px;line-height:1.4; }
        .md-locale-note svg { flex:none;margin-top:1px; }
        .md-locale-note b { font-weight:700;color:#58665d; }
        .md-intro { padding:9px 0 16px; }
        .md-region { font-size:9px;letter-spacing:1.15px;color:var(--muted);font-weight:700; }
        .md-greeting { font:800 27px/1.08 'Manrope',sans-serif;letter-spacing:-1.25px;margin:8px 0 3px; }
        .md-greeting-accent { font:700 19px/1.25 'Manrope',sans-serif;color:var(--green);letter-spacing:-.45px; }
        .md-intro-sub { font-size:11px;color:var(--muted);margin:8px 0 0; }
        .md-membership { position:relative;overflow:hidden;background:var(--green);color:#f7f5ee;border-radius:20px;padding:16px 17px 14px;margin:0 0 18px; }
        .md-membership:after { content:"";position:absolute;width:154px;height:154px;right:-74px;top:-92px;border:1px solid #e6eee01c;border-radius:50%;box-shadow:0 0 0 18px #e6eee00b,0 0 0 38px #e6eee009;pointer-events:none; }
        .md-membership-top,.md-membership-bottom { display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1; }
        .md-membership-label { font-size:9px;letter-spacing:1.35px;text-transform:uppercase;font-weight:700;color:#d2e2d9; }
        .md-membership-symbol { width:27px;height:27px;border-radius:9px;background:#f4db9027;display:grid;place-items:center;color:var(--yellow); }
        .md-membership h2 { font:800 20px 'Manrope',sans-serif;letter-spacing:-.6px;margin:9px 0 3px;position:relative;z-index:1; }
        .md-membership p { color:#d7e4dc;font-size:10px;margin:0;position:relative;z-index:1;line-height:1.45; }
        .md-membership-bottom { border-top:1px solid #ffffff2b;margin-top:12px;padding-top:9px;gap:8px; }
        .md-sample { display:flex;gap:6px;align-items:center;font-size:8px;color:#e0e9e2; }
        .md-sample i { width:6px;height:6px;border-radius:50%;background:var(--yellow);flex:none; }
        .md-inline-action { border:0;background:transparent;color:var(--yellow);font-size:9px;font-weight:700;display:flex;align-items:center;gap:3px;cursor:pointer;white-space:nowrap; }
        .md-heading { display:flex;justify-content:space-between;align-items:flex-end;margin:19px 0 9px; }
        .md-eyebrow { color:var(--muted);font-size:9px;letter-spacing:1px;font-weight:700;text-transform:uppercase;margin-bottom:4px; }
        .md-heading h2 { font:800 17px/1.15 'Manrope',sans-serif;letter-spacing:-.55px;margin:0; }
        .md-link { border:0;background:transparent;color:var(--green);font:700 10px 'DM Sans',sans-serif;display:flex;align-items:center;gap:3px;padding:0 0 2px;cursor:pointer;white-space:nowrap; }
        .md-empty-booking { background:#f2e9d9;border-radius:16px;padding:12px;display:flex;gap:10px;align-items:center; }
        .md-icon-tile { height:37px;width:37px;flex:none;border-radius:12px;background:var(--orange);display:grid;place-items:center;color:#214d43; }
        .md-empty-copy { flex:1;min-width:0; }
        .md-empty-copy strong { display:block;font:700 11px 'Manrope',sans-serif; }
        .md-empty-copy span { display:block;color:#6b766b;font-size:9px;margin-top:3px;line-height:1.35; }
        .md-small-cta { border:0;background:var(--green);color:#fffaf0;padding:8px 9px;border-radius:9px;font-size:9px;font-weight:700;cursor:pointer;white-space:nowrap; }
        .md-live-card { margin-top:9px;display:flex;align-items:center;gap:10px;padding:11px;border-radius:15px;border:1px solid var(--line);background:var(--paper); }
        .md-live-icon { width:37px;height:37px;border-radius:12px;background:#e7eee3;display:grid;place-items:center;color:var(--green); }
        .md-live-copy { flex:1; }
        .md-live-kicker { display:flex;align-items:center;gap:5px;color:var(--green);font-size:8px;font-weight:700; }
        .md-live-kicker i { width:5px;height:5px;border-radius:50%;background:#e08a57; }
        .md-live-title { font:700 11px 'Manrope',sans-serif;margin:4px 0 2px; }
        .md-live-time { font-size:9px;color:var(--muted);display:flex;align-items:center;gap:4px; }
        .md-course { border-radius:16px;background:#f2e9d9;padding:11px;display:flex;align-items:center;gap:10px; }
        .md-course-stamp { height:46px;width:46px;flex:none;border-radius:14px;background:var(--yellow);display:grid;place-items:center;color:#345f50;position:relative; }
        .md-course-stamp:after { content:"";position:absolute;inset:6px;border:1px solid #26645735;border-radius:10px; }
        .md-course-main { flex:1;min-width:0; }
        .md-course-main strong { font:700 11px 'Manrope',sans-serif;display:block; }
        .md-course-main small { display:block;color:var(--muted);font-size:9px;margin-top:3px; }
        .md-progress { height:4px;border-radius:5px;background:#d9d2c1;margin:7px 0 4px;overflow:hidden; }
        .md-progress span { display:block;width:42%;height:100%;background:var(--green);border-radius:5px; }
        .md-progress-label { font-size:8px;color:#5e7068; }
        .md-play { height:29px;width:29px;flex:none;border:0;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;cursor:pointer; }
        .md-checkin-tip { margin-top:9px;border:1px solid #e5e0d6;border-radius:13px;padding:10px;display:flex;align-items:center;gap:9px;background:#fbfaf6; }
        .md-checkin-tip svg { color:var(--green);flex:none; }
        .md-checkin-tip div { flex:1;font-size:10px;font-weight:700; }
        .md-checkin-tip small { display:block;font-weight:400;color:var(--muted);font-size:9px;margin-top:2px; }
        .md-place-list { display:grid;gap:9px; }
        .md-place { border:1px solid var(--line);background:var(--paper);border-radius:15px;padding:11px;display:flex;gap:10px;align-items:center;cursor:pointer;text-align:left;color:inherit;width:100%; }
        .md-monogram { width:39px;height:39px;flex:none;border-radius:12px;display:grid;place-items:center;font:800 10px 'Manrope',sans-serif; }
        .md-monogram.mint { background:#dfece3;color:#266457; }
        .md-monogram.gold { background:#f5e7bd;color:#735f28; }
        .md-monogram.peach { background:#f3e1d6;color:#82583c; }
        .md-place-copy { flex:1;min-width:0; }
        .md-place-copy strong { display:block;font:700 11px 'Manrope',sans-serif; }
        .md-place-copy small { display:block;color:var(--muted);font-size:9px;margin-top:4px; }
        .md-place-kind { margin-top:6px;color:#4f6d61;font-size:8px; }
        .md-tag { font-size:8px;color:#477064;background:#e8f0e9;border-radius:999px;padding:5px 7px;font-weight:700;white-space:nowrap;align-self:flex-start; }
        .md-event { padding:11px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px; }
        .md-date-box { width:41px;height:43px;flex:none;border-radius:11px;background:#e7eee3;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--green); }
        .md-date-box b { font:800 15px 'Manrope',sans-serif;line-height:1; }
        .md-date-box span { font-size:8px;font-weight:700;letter-spacing:.7px;margin-top:3px; }
        .md-event-copy { flex:1;min-width:0; }
        .md-event-copy strong { display:block;font:700 11px 'Manrope',sans-serif; }
        .md-event-copy small { display:block;color:var(--muted);font-size:9px;margin-top:4px; }
        .md-event-label { display:flex;align-items:center;gap:4px;color:#68776c;background:#f0eee7;padding:5px 6px;border-radius:7px;font-size:8px;font-weight:700; }
        .md-featured { margin:15px 0 5px;border-radius:16px;background:#e5ede6;padding:12px;display:flex;gap:10px;align-items:center; }
        .md-featured-icon { width:38px;height:38px;flex:none;border-radius:12px;background:#c7dbcf;color:var(--green);display:grid;place-items:center; }
        .md-featured-copy { flex:1; }
        .md-featured-copy small { display:block;color:#60786a;font-size:8px;letter-spacing:.8px;text-transform:uppercase;font-weight:700; }
        .md-featured-copy strong { display:block;font:700 11px 'Manrope',sans-serif;margin:4px 0 2px; }
        .md-featured-copy span { color:var(--muted);font-size:9px; }
        .md-page-top { padding:9px 0 15px; }
        .md-back { display:flex;align-items:center;gap:5px;border:0;background:transparent;padding:0;color:var(--muted);font-size:10px;cursor:pointer;margin-bottom:12px; }
        .md-page-title { font:800 25px/1.1 'Manrope',sans-serif;letter-spacing:-.9px;margin:0; }
        .md-page-sub { color:var(--muted);font-size:10px;line-height:1.5;margin:6px 0 0; }
        .md-search { display:flex;align-items:center;gap:8px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:0 11px;margin:4px 0 12px;color:var(--muted); }
        .md-search input { height:39px;width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font:500 11px 'DM Sans',sans-serif; }
        .md-search input::placeholder { color:#8a958d; }
        .md-segment { display:flex;gap:4px;padding:4px;background:#eeece4;border-radius:12px;margin:0 0 13px; }
        .md-segment button { flex:1;border:0;background:transparent;border-radius:9px;padding:9px 5px;color:#728079;font:700 10px 'DM Sans',sans-serif;cursor:pointer; }
        .md-segment button.selected { background:var(--paper);color:var(--green);box-shadow:0 1px 4px #1c312d10; }
        .md-filter-row { display:flex;align-items:center;justify-content:space-between;margin:0 0 8px;color:var(--muted);font-size:9px; }
        .md-filter { border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:999px;padding:6px 9px;display:flex;align-items:center;gap:4px;font-size:9px;cursor:pointer; }
        .md-empty-results { background:#f2e9d9;border-radius:15px;padding:17px;text-align:center;color:var(--muted);font-size:10px; }
        .md-booking-card { padding:13px;border-radius:15px;background:var(--paper);border:1px solid var(--line);margin-bottom:9px; }
        .md-booking-head { display:flex;align-items:center;justify-content:space-between;margin-bottom:9px; }
        .md-status { color:#76613a;background:#f5ebcf;border-radius:999px;padding:5px 8px;font-size:8px;font-weight:700; }
        .md-booking-card strong { display:block;font:700 12px 'Manrope',sans-serif; }
        .md-booking-card p { color:var(--muted);font-size:9px;line-height:1.45;margin:5px 0 0; }
        .md-courses-list { display:grid;gap:9px; }
        .md-online-card { padding:12px;border:1px solid var(--line);border-radius:15px;background:var(--paper);display:flex;gap:10px;align-items:center; }
        .md-online-icon { width:40px;height:40px;flex:none;border-radius:12px;background:#e7eee3;color:var(--green);display:grid;place-items:center; }
        .md-online-copy { flex:1;min-width:0; }
        .md-online-copy strong { display:block;font:700 11px 'Manrope',sans-serif; }
        .md-online-copy small { display:block;color:var(--muted);font-size:9px;margin-top:4px;line-height:1.35; }
        .md-online-footer { display:flex;align-items:center;justify-content:space-between;margin-top:9px;color:#5e7068;font-size:8px; }
        .md-profile-card { border-radius:16px;background:var(--green);padding:16px;color:#f7f5ee;display:flex;align-items:center;gap:12px;margin:5px 0 15px; }
        .md-initials { width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:#f4db90;color:var(--green);font:800 13px 'Manrope',sans-serif; }
        .md-profile-card strong { font:700 13px 'Manrope',sans-serif;display:block; }
        .md-profile-card small { color:#d7e4dc;font-size:9px;display:block;margin-top:4px; }
        .md-settings { background:var(--paper);border:1px solid var(--line);border-radius:15px;overflow:hidden; }
        .md-setting-row { width:100%;padding:12px;display:flex;align-items:center;gap:10px;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left;color:var(--ink);cursor:pointer; }
        .md-setting-row:last-child { border-bottom:0; }
        .md-setting-icon { color:var(--green);display:grid;place-items:center; }
        .md-setting-copy { flex:1;font-size:10px;font-weight:600; }
        .md-setting-copy small { display:block;color:var(--muted);font-size:8px;font-weight:400;margin-top:3px; }
        .md-notice { position:absolute;z-index:8;bottom:78px;left:50%;transform:translateX(-50%);max-width:calc(100% - 30px);background:#1c312d;color:#f9f7f1;padding:10px 14px;border-radius:12px;font-size:10px;box-shadow:0 8px 24px #16272430;text-align:center; }
        .md-bottom { flex:none;display:flex;justify-content:space-around;align-items:center;padding:8px 7px max(11px, env(safe-area-inset-bottom));background:var(--paper);border-top:1px solid var(--line); }
        .md-tab { border:0;background:transparent;display:flex;align-items:center;flex-direction:column;gap:3px;min-width:53px;padding:2px;color:#87928b;font:600 8px 'DM Sans',sans-serif;cursor:pointer; }
        .md-tab.active { color:var(--green); }
        .md-tab.active svg { stroke-width:2.3; }
        .md-tab:focus-visible,.md-prototype button:focus-visible,.md-search input:focus-visible { outline:2px solid var(--orange);outline-offset:2px; }
        @media (max-width:389px) { .md-prototype { border:0; } }
      `}</style>

      <div className="md-scroll">
        <header className="md-top">
          <div className="md-brand">
            <div className="md-mark"><Dumbbell size={19} /></div>
            <div>
              <div className="md-brand-name">MaydanGo</div>
              <button className="md-city" onClick={() => showNotice("Location preview · Baghdad, Iraq")}>
                <MapPin size={11} /> Baghdad, Iraq <ChevronDown size={11} />
              </button>
            </div>
          </div>
          <div className="md-actions">
            <div className="md-language-wrap">
              <button className="md-language" onClick={() => setLanguageOpen(!languageOpen)} aria-expanded={languageOpen}>
                <Globe2 size={13} /> English <ChevronDown size={12} />
              </button>
              {languageOpen && <div className="md-language-menu">
                <div style={{ padding: "7px 8px 5px", color: "#77857c", fontSize: 8, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase" }}>Language preview control</div>
                {["English", "Arabic", "Kurdish (Sorani)"].map((item) => (
                  <button className="md-language-option" key={item} onClick={() => {
                    setLanguageOpen(false);
                    showNotice(item === "English" ? "English sample copy is shown." : `${item} is a preview option only; translation is not available.`);
                  }}>
                    {item}{item === "English" && <Check size={13} />}
                  </button>
                ))}
              </div>}
            </div>
            <button className="md-icon-button" aria-label="Preview check-in" onClick={() => showNotice("Check-in preview · no scan or attendance is recorded.")}><QrCode size={18} /></button>
          </div>
        </header>
        <div className="md-locale-note"><CircleHelp size={11} /><span><b>English sample screen.</b> Arabic and Sorani are preview options only; translated copy is not available here.</span></div>

        {screen === "Home" && <>
          <section className="md-intro">
            <div className="md-region">IRAQ · KURDISTAN · NORTH · SOUTH · WEST</div>
            <h1 className="md-greeting">Good morning</h1>
            <div className="md-greeting-accent">Make room for feeling good.</div>
            <p className="md-intro-sub">A little movement, in a way that works for you.</p>
          </section>
          <section className="md-membership">
            <div className="md-membership-top"><div className="md-membership-label">Your membership</div><div className="md-membership-symbol"><Sparkles size={15} /></div></div>
            <h2>Find your way in</h2>
            <p>Explore gyms, pools, clubs and classes across Iraq.</p>
            <div className="md-membership-bottom">
              <div className="md-sample"><i /> Illustrative preview · no active entitlement</div>
              <button className="md-inline-action" onClick={() => showNotice("Membership details are illustrative in this prototype.")}>Details <ChevronRight size={13} /></button>
            </div>
          </section>
          <section>
            <SectionHeading eyebrow="Your plans" title="Coming up" action="Bookings" onAction={() => navigate("Bookings")} />
            <div className="md-empty-booking">
              <div className="md-icon-tile"><CalendarDays size={18} /></div>
              <div className="md-empty-copy"><strong>No upcoming bookings</strong><span>Find a class or activity that fits your day.</span></div>
              <button className="md-small-cta" onClick={() => navigate("Explore")}>Explore</button>
            </div>
            <button className="md-live-card" style={{ width: "100%", textAlign: "left", cursor: "pointer", color: "inherit" }} onClick={() => navigate("Online")}>
              <div className="md-live-icon"><Video size={18} /></div>
              <div className="md-live-copy">
                <div className="md-live-kicker"><i /> NEXT LIVE CLASS · SAMPLE</div>
                <div className="md-live-title">Gentle mobility</div>
                <div className="md-live-time"><Clock3 size={11} /> Today, 6:00 PM · Online</div>
              </div><ChevronRight size={17} color="#718079" />
            </button>
          </section>
          <section>
            <SectionHeading eyebrow="Online training" title="Pick up where you left off" action="See all" onAction={() => navigate("Online")} />
            <div className="md-course">
              <div className="md-course-stamp"><Waves size={21} /></div>
              <div className="md-course-main">
                <strong>Everyday mobility</strong><small>Coach Dalia · 3 of 7 lessons</small>
                <div className="md-progress"><span /></div><div className="md-progress-label">Illustrative progress · 42%</div>
              </div>
              <button className="md-play" aria-label="Preview course" onClick={() => showNotice("Sample course preview · access is not verified.")}><Play size={12} fill="currentColor" /></button>
            </div>
            <div className="md-checkin-tip"><QrCode size={18} /><div>At the door? Scan to check in.<small>A reservation is not an attendance record.</small></div><ArrowDown size={14} /></div>
          </section>
          <section>
            <SectionHeading eyebrow="Find your fit" title="Nearby places" action="Explore all" onAction={() => { setExploreMode("Places"); navigate("Explore"); }} />
            <p style={{ margin: "-3px 0 9px", color: "var(--muted)", fontSize: 10 }}>Different spaces for different ways to move.</p>
            <div className="md-place-list">
              {places.slice(0, 2).map((place) => (
                <button className="md-place" key={place.name} onClick={() => showNotice(`${place.name} · sample place details only.`)}>
                  <div className={`md-monogram ${place.color}`}>{place.mark}</div><div className="md-place-copy"><strong>{place.name}</strong><small>{place.area}</small><div className="md-place-kind">{place.type}</div></div><span className="md-tag">Sample place</span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <SectionHeading eyebrow="Out and about" title="Upcoming events" action="See all" onAction={() => { setExploreMode("Events"); navigate("Explore"); }} />
            {events.map((event) => (
              <div className="md-event" key={event.name}>
                <div className="md-date-box"><b>{event.day}</b><span>{event.month}</span></div>
                <div className="md-event-copy"><strong>{event.name}</strong><small>{event.detail} · sample listing</small></div>
                <span className="md-event-label"><Ticket size={10} /> Event</span>
              </div>
            ))}
          </section>
          <button className="md-featured" style={{ width: "100%", textAlign: "left", cursor: "pointer", color: "inherit" }} onClick={() => { setOnlineMode("Courses"); navigate("Online"); }}>
            <div className="md-featured-icon"><Sparkles size={18} /></div><div className="md-featured-copy"><small>Featured course · sample</small><strong>Build a steady movement habit</strong><span>With instructor Noor · 5 short lessons</span></div><ChevronRight size={16} color="#526b5f" />
          </button>
          <div style={{ height: 8 }} />
        </>}

        {screen === "Explore" && <>
          <div className="md-page-top"><div className="md-eyebrow">Discover across Iraq</div><h1 className="md-page-title">Explore</h1><p className="md-page-sub">Find spaces and events that fit your way to move.</p></div>
          <button className="md-city" style={{ margin: "0 0 11px", padding: "5px 0" }} onClick={() => showNotice("Location preview · choose a city from a future location selector.")}><MapPin size={12} /> Baghdad, Iraq <ChevronDown size={11} /></button>
          <label className="md-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={exploreMode === "Places" ? "Search places or activities" : "Search events"} aria-label="Search discovery" /></label>
          <div className="md-segment" role="tablist" aria-label="Explore type">
            {(["Places", "Events"] as ExploreMode[]).map((mode) => <button key={mode} role="tab" aria-selected={exploreMode === mode} className={exploreMode === mode ? "selected" : ""} onClick={() => setExploreMode(mode)}>{mode}</button>)}
          </div>
          <div className="md-filter-row"><span>{exploreMode === "Places" ? `${filteredPlaces.length} sample places` : `${filteredEvents.length} sample events`}</span><button className="md-filter" onClick={() => showNotice("Filters preview · date, time, category, eligibility and access.")}>Filters <ChevronDown size={11} /></button></div>
          {exploreMode === "Places" ? filteredPlaces.length ? <div className="md-place-list">{filteredPlaces.map((place) => (
            <button className="md-place" key={place.name} onClick={() => showNotice(`${place.name} · sample place; access details are not verified.`)}>
              <div className={`md-monogram ${place.color}`}>{place.mark}</div><div className="md-place-copy"><strong>{place.name}</strong><small>{place.area}</small><div className="md-place-kind">{place.type}</div></div><span className="md-tag">Sample place</span>
            </button>
          ))}</div> : <div className="md-empty-results">No sample places match that search. Try another name or activity.</div> : filteredEvents.length ? filteredEvents.map((event) => (
            <div className="md-booking-card" key={event.name}>
              <div className="md-booking-head"><span className="md-tag">Sample event</span><span className="md-event-label"><Ticket size={10} /> {event.kind}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div className="md-date-box"><b>{event.day}</b><span>{event.month}</span></div><div className="md-event-copy"><strong>{event.name}</strong><small>{event.detail}</small></div></div>
              <p>Illustrative listing only · availability and attendance are not confirmed.</p>
            </div>
          )) : <div className="md-empty-results">No sample events match that search. Try another term.</div>}
          <div style={{ height: 14 }} />
        </>}

        {screen === "Bookings" && <>
          <div className="md-page-top"><div className="md-eyebrow">Your plans</div><h1 className="md-page-title">Bookings</h1><p className="md-page-sub">Review reservations and requests in one place.</p></div>
          <div className="md-segment"><button className="selected">Upcoming</button><button onClick={() => showNotice("Past bookings are not included in this sample.")}>Past</button></div>
          <div className="md-empty-booking" style={{ marginBottom: 13 }}>
            <div className="md-icon-tile"><CalendarDays size={18} /></div>
            <div className="md-empty-copy"><strong>No upcoming bookings</strong><span>Your confirmed reservations will appear here.</span></div>
          </div>
          <div className="md-eyebrow" style={{ margin: "16px 0 8px" }}>Illustrative sample items · not member records</div>
          <article className="md-booking-card">
            <div className="md-booking-head"><span className="md-status">Sample · Requested</span><span style={{ color: "var(--muted)", fontSize: 8 }}>Not a live request</span></div>
            <strong>Gentle mobility class</strong><p>Online · Today, 6:00 PM<br />Example booking status only. This does not confirm a place or attendance.</p>
          </article>
          <article className="md-booking-card">
            <div className="md-booking-head"><span className="md-status">Sample · Reservation</span><span style={{ color: "var(--muted)", fontSize: 8 }}>Illustrative</span></div>
            <strong>Open pool morning</strong><p>Northside Swim Club · Erbil<br />Sample listing only · access and availability are not verified.</p>
          </article>
          <button className="md-small-cta" style={{ marginTop: 4 }} onClick={() => navigate("Explore")}>Explore activities</button>
        </>}

        {screen === "Online" && <>
          <div className="md-page-top"><div className="md-eyebrow">Move at your pace</div><h1 className="md-page-title">Online training</h1><p className="md-page-sub">Courses, live classes and coaching, wherever you are.</p></div>
          <div className="md-segment" role="tablist" aria-label="Online training type">
            {(["Courses", "Live classes", "Coaching"] as OnlineMode[]).map((mode) => <button key={mode} role="tab" aria-selected={onlineMode === mode} className={onlineMode === mode ? "selected" : ""} onClick={() => setOnlineMode(mode)}>{mode}</button>)}
          </div>
          {onlineMode === "Courses" && <>
            <SectionHeading eyebrow="Continue learning" title="In progress · sample" />
            <div className="md-course">
              <div className="md-course-stamp"><Waves size={21} /></div>
              <div className="md-course-main"><strong>Everyday mobility</strong><small>Coach Dalia · 3 of 7 lessons</small><div className="md-progress"><span /></div><div className="md-progress-label">Illustrative progress · 42%</div></div>
              <button className="md-play" aria-label="Preview sample course" onClick={() => showNotice("Sample course preview · enrollment and access are not verified.")}><Play size={12} fill="currentColor" /></button>
            </div>
            <SectionHeading eyebrow="Explore" title="Courses for your routine" />
            <div className="md-courses-list">
              {[
                ["Build a steady movement habit", "Instructor Noor · 5 short lessons", "Sample course"],
                ["Strength basics at home", "Coach Dalia · 6 lessons", "Sample course"],
                ["Water confidence", "Instructor Shilan · 4 lessons", "Sample course"],
              ].map(([title, detail, label]) => <button className="md-online-card" key={title} onClick={() => showNotice(`${title} · sample course preview only.`)}>
                <div className="md-online-icon"><Dumbbell size={18} /></div><div className="md-online-copy"><strong>{title}</strong><small>{detail}</small><div className="md-online-footer"><span>{label}</span><span>Access not verified</span></div></div><ChevronRight size={16} color="#718079" />
              </button>)}
            </div>
          </>}
          {onlineMode === "Live classes" && <>
            <SectionHeading eyebrow="Join from wherever suits you" title="Upcoming · sample" />
            {[
              ["Gentle mobility", "Today · 6:00 PM · Online", "Coach Dalia"],
              ["Stretch and reset", "Tomorrow · 5:30 PM · Online", "Instructor Noor"],
              ["Beginner strength", "Friday · 7:00 PM · Online", "Coach Rami"],
            ].map(([title, detail, coach]) => <button className="md-online-card" key={title} style={{ width: "100%", textAlign: "left", cursor: "pointer", color: "inherit", marginBottom: 9 }} onClick={() => showNotice(`${title} · sample class listing; booking is not available in this preview.`)}>
              <div className="md-online-icon"><Video size={18} /></div><div className="md-online-copy"><span className="md-live-kicker"><i /> SAMPLE LIVE CLASS</span><strong style={{ marginTop: 4 }}>{title}</strong><small>{detail} · {coach}</small></div><ChevronRight size={16} color="#718079" />
            </button>)}
            <p className="md-page-sub">Sample schedule only · no class access, booking or attendance is confirmed.</p>
          </>}
          {onlineMode === "Coaching" && <>
            <SectionHeading eyebrow="Support that fits your goals" title="Coaching · sample" />
            <div className="md-featured" style={{ marginTop: 0 }}>
              <div className="md-featured-icon"><UserRound size={18} /></div><div className="md-featured-copy"><small>Instructor preview</small><strong>Coach Dalia</strong><span>Mobility · strength foundations</span></div>
            </div>
            <article className="md-booking-card" style={{ marginTop: 10 }}>
              <span className="md-tag">Sample coaching option</span><strong style={{ marginTop: 9 }}>One-to-one online guidance</strong><p>Explore coaching support and instructor information. This preview does not create a request or verify access.</p>
              <button className="md-small-cta" style={{ marginTop: 10 }} onClick={() => showNotice("Coaching details preview only · no request was sent.")}>Preview coaching</button>
            </article>
          </>}
          <div style={{ height: 12 }} />
        </>}

        {screen === "Profile" && <>
          <div className="md-page-top"><div className="md-eyebrow">Your account</div><h1 className="md-page-title">Profile</h1><p className="md-page-sub">Manage account preferences and find help.</p></div>
          <div className="md-profile-card"><div className="md-initials">MG</div><div><strong>MaydanGo member</strong><small>Illustrative profile · sample account</small></div><ChevronRight size={17} color="#d7e4dc" /></div>
          <div className="md-eyebrow" style={{ margin: "15px 0 8px" }}>Account and preferences</div>
          <div className="md-settings">
            {[
              [<UserRound size={17} />, "Account details", "Personal information preview"],
              [<Sparkles size={17} />, "Membership and access", "No active entitlement shown"],
              [<Globe2 size={17} />, "Language", "English · preview control"],
              [<CircleHelp size={17} />, "Help and safety", "Find support information"],
              [<Check size={17} />, "Privacy and consent", "Settings preview"],
            ].map(([icon, title, detail]) => <button className="md-setting-row" key={String(title)} onClick={() => showNotice(`${title} · local preview only.`)}>
              <span className="md-setting-icon">{icon}</span><span className="md-setting-copy">{title as string}<small>{detail as string}</small></span><ChevronRight size={15} color="#839088" />
            </button>)}
          </div>
          <div className="md-eyebrow" style={{ margin: "16px 0 8px" }}>Sample only</div>
          <div className="md-checkin-tip"><CircleHelp size={17} /><div>Prototype account<small>No personal member data is displayed or stored.</small></div></div>
        </>}
      </div>

      {notice && <button className="md-notice" onClick={() => setNotice("")} role="status">{notice}<span style={{ marginLeft: 7, opacity: .7 }}>×</span></button>}
      <nav className="md-bottom" aria-label="Main navigation">
        {[
          { label: "Home" as Screen, icon: Dumbbell },
          { label: "Explore" as Screen, icon: Compass },
          { label: "Bookings" as Screen, icon: CalendarDays },
          { label: "Online" as Screen, icon: Play },
          { label: "Profile" as Screen, icon: UserRound },
        ].map(({ label, icon: Icon }) => (
          <button className={`md-tab ${screen === label ? "active" : ""}`} key={label} aria-current={screen === label ? "page" : undefined} onClick={() => navigate(label)}>
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
