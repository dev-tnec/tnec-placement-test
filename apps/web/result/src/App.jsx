import { useEffect, useMemo, useState } from "react";
import { buildReport } from "./report.js";

const POLL_MS = 6000;

const ICONS = {
  Listening: "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z",
  Reading: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  Writing: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  Speaking: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  check: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  print: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

function Icon({ path, className = "icon" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Hasil tidak bisa dimuat.");
  return data;
}

function Header() {
  return (
    <header className="report__header">
      <div className="report__header-inner">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">TN</span>
          <span className="brand__text">
            <span className="brand__row">
              <span className="brand__name">TITIK NOL</span>
              <span className="brand__tag">English Course</span>
            </span>
            <span className="brand__sub">Hasil Tes dan Diagnostik</span>
          </span>
        </div>
        <div className="header-actions">
          <a className="btn btn--ghost" href="#rencana">Rekomendasi Belajar</a>
          <button className="btn btn--navy" type="button" onClick={() => window.print()}>
            <Icon path={ICONS.print} />
            Unduh PDF / Cetak
          </button>
        </div>
      </div>
    </header>
  );
}

function Dial({ value, max, percent }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="dial">
      <svg className="dial__svg" viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={radius} fill="none" stroke="var(--yellow-400)" strokeWidth="12"
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <span className="dial__value">
        <strong>{value}</strong>
        {max ? <small>{max}</small> : null}
      </span>
    </div>
  );
}

function Hero({ report }) {
  return (
    <section className="hero" aria-labelledby="report-title">
      <div className="hero__grid">
        <div className="hero__copy">
          <div className="hero__top">
            <span className="hero__eyebrow">
              <span className="hero__dot" aria-hidden="true" />
              {report.testName}
            </span>
            {report.code ? <span className="hero__code">Kode: #{report.code}</span> : null}
          </div>
          <h1 className="hero__title" id="report-title">{report.name}</h1>
          <p className="hero__lead">{report.summary}</p>
          <dl className="hero__meta">
            {report.meta.map((item) => (
              <div className="hero__cell" key={item.label}>
                <dt>{item.label}</dt>
                <dd className={item.accent ? "is-accent" : ""}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="score-card">
          <span className="score-card__label">{report.score.labelTop}</span>
          <Dial value={report.score.value} max={report.score.max} percent={report.score.percent} />
          <p className="score-card__band">{report.score.label}</p>
          <div className="score-card__rule">
            <span>Standar penilaian</span>
            <strong>{report.score.scale}</strong>
          </div>
          <p className="score-card__note">{report.score.caption}</p>
        </div>
      </div>
    </section>
  );
}

function Skills({ report }) {
  return (
    <section className="section" aria-labelledby="skills-title">
      <div className="section-head">
        <div>
          <h2 className="section-head__title" id="skills-title">Rincian Performa</h2>
          <p className="section-head__sub">Evaluasi setiap komponen yang dinilai pada tes ini</p>
        </div>
        <div className="legend">
          <span className="legend__item"><span className="legend__dot legend__dot--strong" /> Kompeten</span>
          <span className="legend__item"><span className="legend__dot legend__dot--mid" /> Sedang</span>
          <span className="legend__item"><span className="legend__dot legend__dot--low" /> Prioritas</span>
        </div>
      </div>
      <div className="skills">
        {report.skills.map((skill) => (
          <article className={`skill skill--${skill.tone}`} key={skill.name}>
            <div className="skill__top">
              <span className="skill__icon"><Icon path={ICONS[skill.name] || ICONS.check} /></span>
              <span className={`skill__badge skill__badge--${skill.tone}`}>{skill.badge}</span>
            </div>
            <h3 className="skill__name">{skill.name}</h3>
            <div className="skill__score">
              <span className="skill__value">{skill.value}</span>
              {skill.unit ? <span className="skill__unit">{skill.unit}</span> : null}
              <span className="skill__raw">{skill.raw}</span>
            </div>
            <p className="skill__note">{skill.note}</p>
            <div className="skill__bar">
              <div className="skill__bar-label"><span>Progres</span><strong>{skill.percentLabel}</strong></div>
              <div className="skill__track">
                <div className={`skill__fill skill__fill--${skill.tone}`} style={{ width: `${Math.max(0, Math.min(100, skill.percent || 0))}%` }} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Gap({ report }) {
  return (
    <section className={`split${report.gap ? "" : " split--single"}`} {...(report.gap ? { "aria-labelledby": "gap-title" } : { "aria-label": "Profil hasil" })}>
      {report.gap ? (
        <div className="gap">
          <div className="gap__head">
            <div>
              <h2 className="gap__title" id="gap-title">{report.gap.title}</h2>
              <p className="gap__sub">{report.gap.subtitle}</p>
            </div>
            <span className="gap__badge">{report.gap.badge}</span>
          </div>
          <div className="gap__rows">
            {report.gap.rows.map((row) => (
              <div className="gap__row" key={row.name}>
                <div className="gap__row-head">
                  <span>{row.name} (perolehan {row.value}, target {row.target})</span>
                  <strong className={`is-${row.tone}`}>{row.delta}</strong>
                </div>
                <div className="gap__track">
                  <div className={`gap__fill gap__fill--${row.tone}`} style={{ width: `${Math.max(0, Math.min(100, row.percent))}%` }} />
                  {row.marker === null || row.marker === undefined ? null : (
                    <div className="gap__marker" style={{ left: `${Math.max(0, Math.min(100, row.marker))}%` }} />
                  )}
                </div>
              </div>
            ))}
          </div>
          {report.gap.note ? (
            <div className="gap__note">
              <Icon path={ICONS.info} className="icon icon--muted" />
              <p><strong>Rekomendasi cepat:</strong> {report.gap.note}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <aside className="profile" aria-label="Profil hasil">
        <div>
          <div className="profile__top">
            <span className="profile__eyebrow">{report.profile.eyebrow}</span>
            {report.profile.tag ? <span className="profile__tag">{report.profile.tag}</span> : null}
          </div>
          <h2 className="profile__title">{report.profile.title}</h2>
          <p className="profile__text">{report.profile.text}</p>
          <dl className="profile__stats">
            {report.profile.stats.map((stat) => (
              <div className="profile__stat" key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <a className="profile__cta" href={report.profile.cta.href} target="_blank" rel="noopener">{report.profile.cta.label}</a>
      </aside>
    </section>
  );
}

function Details({ report }) {
  if (!report.details) return null;
  return (
    <section className="panel" aria-labelledby="details-title">
      <div className="panel__head">
        <div>
          <div className="panel__title-row">
            <h2 className="panel__title" id="details-title">{report.details.title}</h2>
            {report.details.band && report.details.band !== "-" ? <span className="panel__band">Band {report.details.band}</span> : null}
          </div>
          <p className="panel__sub">{report.details.subtitle}</p>
        </div>
      </div>
      <div className="details">
        {report.details.groups.map((group) => (
          <article className="detail-group" key={`${group.title}-${group.band}`}>
            <header className="detail-group__head">
              <div>
                <h3 className="detail-group__title">{group.title}</h3>
                <span className="detail-group__meta">{group.meta}</span>
              </div>
              <span className="detail-group__band">Band {group.band}</span>
            </header>
            <div className="criteria">
              {group.criteria.map((criterion) => (
                <div className="criterion" key={criterion.label}>
                  <div className="criterion__head">
                    <span className="criterion__label">{criterion.label}</span>
                    <span className="criterion__value">{criterion.value}</span>
                  </div>
                  {criterion.note ? <p className="criterion__note">{criterion.note}</p> : null}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Plan({ report }) {
  return (
    <section className="panel panel--plain" aria-labelledby="plan-title">
      <div className="plan" id="rencana">
        <div className="plan__main">
          <div className="plan__head">
            <span className="plan__dot" aria-hidden="true" />
            <h2 className="plan__title" id="plan-title">Rencana Belajar Kamu</h2>
          </div>
          <div className="plan__grid">
            {report.plan.map((item, index) => (
              <div className="plan__item" key={item.title}>
                <span className="plan__index">{index + 1}</span>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="disclaimer">
          <div className="disclaimer__head">
            <Icon path={ICONS.info} className="icon icon--muted" />
            <strong>Catatan Hasil</strong>
          </div>
          <p>{report.disclaimer}</p>
        </div>
      </div>
      {report.programs.length ? (
        <div className="programs">
          <h2 className="section-head__title">Program yang Sesuai</h2>
          <div className="programs__grid">
            {report.programs.map((program) => (
              <a className="program" href={program.url} target="_blank" rel="noopener" key={program.url}>
                {program.image ? <img className="program__img" src={program.image} alt="" /> : null}
                <span className="program__body">
                  {program.recommended ? <span className="program__tag">Rekomendasi kami</span> : null}
                  <span className="program__name">{program.name}</span>
                  <span className="program__meta">
                    {program.recommended && program.levelLabel ? `Sesuai level ${program.levelLabel}` : program.levels?.length ? `Untuk level ${program.levels.join(", ")}` : ""}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Footer({ report }) {
  return (
    <footer className="footer">
      <div className="footer__brand">
        <span className="footer__mark" aria-hidden="true">TN</span>
        <span><strong>Titik Nol English Course</strong> · Kampung Inggris Pare, Kediri, Jawa Timur</span>
      </div>
      <div className="footer__meta">
        <span>{report.name}</span>
        <span aria-hidden="true">·</span>
        <span>{report.code ? `#${report.code}` : report.testName}</span>
        <span aria-hidden="true">·</span>
        <span>{report.date}</span>
      </div>
    </footer>
  );
}

function Pending({ data }) {
  const speaking = data?.speaking;
  return (
    <div className="state">
      <span className="state__eyebrow">Menyiapkan hasil</span>
      <h1 className="state__title">Hasil kamu sedang disiapkan</h1>
      <p className="state__text">
        {speaking?.answered
          ? `${speaking.answered} dari ${speaking.total} jawaban speaking sudah masuk dan sedang dinilai.`
          : "Rekaman speaking kamu sedang dinilai."}
        {" "}Halaman ini menyegarkan sendiri setiap beberapa detik, jadi kamu tidak perlu menekan apa pun.
      </p>
      <div className="state__loader" role="status">Menunggu penilaian...</div>
    </div>
  );
}

function Failure({ message }) {
  return (
    <div className="state">
      <span className="state__eyebrow">Hasil tidak bisa dibuka</span>
      <h1 className="state__title">Tautan ini belum siap</h1>
      <p className="state__text">{message}</p>
      <a className="btn btn--navy" href="/">Kembali ke halaman tes</a>
    </div>
  );
}

export default function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("token");
  const attempt = params.get("attempt");
  const [state, setState] = useState({ status: "loading", data: null, error: "" });

  useEffect(() => {
    const url = token
      ? `/api/results/${encodeURIComponent(token)}`
      : attempt
        ? `/api/attempts/${encodeURIComponent(attempt)}/result`
        : null;
    if (!url) {
      setState({ status: "error", data: null, error: "Tautan ini tidak memuat data hasil. Buka tautan dari email atau WhatsApp kamu." });
      return undefined;
    }
    let timer = null;
    let stopped = false;
    const load = async () => {
      try {
        const data = await fetchJson(url);
        if (stopped) return;
        setState({ status: data.ready ? "ready" : "pending", data, error: "" });
        if (!data.ready) timer = setTimeout(load, POLL_MS);
      } catch (error) {
        if (!stopped) setState({ status: "error", data: null, error: error.message });
      }
    };
    load();
    return () => { stopped = true; clearTimeout(timer); };
  }, [token, attempt]);

  const report = useMemo(
    () => (state.status === "ready" && state.data?.result
      ? buildReport({ ...state.data.result, name: state.data.name || state.data.result.name }, state.data.programs || [])
      : null),
    [state],
  );

  useEffect(() => {
    if (report) document.title = `Hasil ${report.testName}, Titik Nol English Course`;
  }, [report]);

  if (state.status === "loading") return <div className="state"><div className="state__loader" role="status">Memuat hasil...</div></div>;
  if (state.status === "error") return <Failure message={state.error} />;
  if (state.status === "pending") return <Pending data={state.data} />;
  if (!report) return <Failure message="Data hasil tidak ditemukan pada tautan ini." />;

  return (
    <div className="report">
      <Header />
      <main className="report__main">
        <Hero report={report} />
        <Skills report={report} />
        <Gap report={report} />
        <Details report={report} />
        <Plan report={report} />
        <Footer report={report} />
      </main>
    </div>
  );
}
