// Certificate PDF composition with @react-pdf/renderer, per docs/prd-certificate-pdf-react.md.
// The three designs are ported 1:1 from the HTML templates in apps/admin/certificates: the
// same tokens, the same mm geometry, the same copy. This module runs inside the admin Node
// server; no browser, no network call.
import { Document, Page, Text, View, Image, Svg, Path, Line, Rect, Polygon, StyleSheet, Font, Link } from "@react-pdf/renderer";
import { createElement as h } from "react";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = resolve(here, "../../../apps/admin/assets/fonts");
const ASSETS_DIR = resolve(here, "../../../apps/admin/certificates");

// mm to pt: PDF users 72pt per inch, one inch is 25.4mm.
export const MM = 72 / 25.4;
const mm = (v) => `${v}mm`;

let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: resolve(FONTS_DIR, "Inter-Regular.ttf"), fontWeight: 400 },
      { src: resolve(FONTS_DIR, "Inter-Medium.ttf"), fontWeight: 500 },
      { src: resolve(FONTS_DIR, "Inter-SemiBold.ttf"), fontWeight: 600 },
      { src: resolve(FONTS_DIR, "Inter-Bold.ttf"), fontWeight: 700 },
      { src: resolve(FONTS_DIR, "Inter-ExtraBold.ttf"), fontWeight: 800 },
    ],
  });
  Font.register({
    family: "Gelasio",
    fonts: [
      { src: resolve(FONTS_DIR, "Gelasio-Regular.ttf"), fontWeight: 400 },
      { src: resolve(FONTS_DIR, "Gelasio-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  fontsRegistered = true;
}

const logoCache = {};
function logoData(color) {
  if (!logoCache[color]) logoCache[color] = readFileSync(resolve(ASSETS_DIR, `logo/logo-${color}.png`));
  return logoCache[color];
}

// The completion background and the landscape frame are loaded from the same SVG files the
// print page uses, converted once to PNG bytes the PDF can embed as vector-rasterized art.
const bgCache = {};
function backgroundData(name) {
  if (!bgCache[name]) {
    const file = name === "completion" ? "completion-bg.svg" : "frame.svg";
    bgCache[name] = readFileSync(resolve(ASSETS_DIR, file), "utf8");
  }
  return bgCache[name];
}

/* ---------- shared ornaments ---------- */

function Diamond({ size, filled, color }) {
  const stroke = filled ? {} : { stroke: color, strokeWidth: 1, fill: "none" };
  return h(Svg, { width: size, height: size, viewBox: "0 0 10 10" },
    h(Polygon, { points: "5,0 10,5 5,10 0,5", fill: filled ? color : "none", ...stroke }));
}

function Ornament({ color }) {
  return h(View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1.8 * MM, marginTop: 3.4 * MM } },
    h(Diamond, { size: 1.35 * MM, filled: true, color }),
    h(Diamond, { size: 2.3 * MM, filled: false, color }),
    h(View, { style: { width: "54%", borderTopWidth: 0.45 * MM, borderTopColor: color } }),
    h(Diamond, { size: 2.3 * MM, filled: false, color }),
    h(Diamond, { size: 1.35 * MM, filled: true, color }),
  );
}

/* ---------- Certificate of Completion, A4 portrait ---------- */

function CompletionCertificate({ values }) {
  const ink = "#111111";
  const text = "#333333";
  const navy = "#1F3448";
  return h(Page, { size: "A4", style: { backgroundColor: "#FDFDFA", position: "relative" } },
    // Background art: gold rule, navy ribbon, corner sweeps, ported from completion-bg.svg.
    h(Svg, { style: { position: "absolute", top: 0, left: 0 }, width: mm(210), height: mm(297), viewBox: "0 0 1123 1587" },
      h(Rect, { x: 74, y: 0, width: 3, height: 1587, fill: "#D9A93F" }),
      h(Rect, { x: 80, y: 0, width: 155, height: 1587, fill: "#1F3448" }),
      h(Path, { d: "M0 0 H560 C400 18 180 100 0 195 Z", fill: "#1F3448" }),
      h(Path, { d: "M755 0 H1123 V92 C1000 62 870 25 755 0 Z", fill: "#D9A93F" }),
    ),
    // Logo
    h(Image, { src: logoData("ink"), style: { position: "absolute", left: mm(51), top: mm(26), width: mm(62), height: mm(10.5) } }),
    // Contact block with the thin left rule
    h(View, { style: { position: "absolute", left: mm(117), top: mm(25), borderLeftWidth: 0.3 * MM, borderLeftColor: "#8A99A8", paddingLeft: 3 * MM } },
      h(Text, { style: { fontSize: 3.15 * MM, color: "#222222", marginBottom: 0.6 * MM, fontFamily: "Inter", fontWeight: 700 } }, "SK DIKNAS NO. 421.9/985/418.20/2021"),
      ["Jl. Brawijaya No.75, Mangunrejo, Tulungrejo,", "Kec. Pare, Kabupaten Kediri, Jawa Timur", "Mobile : 0823-3314-3544", "E-mail : admin@titiknolenglish.com", "Website: titiknolenglish.com"].map((line, i) =>
        h(Text, { key: i, style: { fontSize: 3 * MM, color: text, lineHeight: 1.45, fontFamily: "Inter" } }, line)),
    ),
    // Title
    h(View, { style: { position: "absolute", left: mm(51), top: mm(54) } },
      h(Text, { style: { fontSize: 21 * MM, fontWeight: 800, color: ink, lineHeight: 0.95, letterSpacing: -0.55, fontFamily: "Inter" } }, "Certificate"),
      h(Text, { style: { fontSize: 15 * MM, fontWeight: 800, color: ink, lineHeight: 1, letterSpacing: -0.36, fontFamily: "Inter" } }, "of Completion"),
    ),
    h(Text, { style: { position: "absolute", left: mm(51), top: mm(100.5), fontSize: 3.7 * MM, color: ink, fontFamily: "Inter", fontWeight: 700 } }, `Cert. Number: ${values.nomor}`),
    h(Text, { style: { position: "absolute", left: mm(51), top: mm(110.5), fontSize: 3.7 * MM, color: text, fontFamily: "Inter" } }, "This is to certify that"),
    h(View, { style: { position: "absolute", left: mm(51), top: mm(120.8), right: mm(22), borderBottomWidth: 0.4 * MM, borderBottomColor: navy, paddingBottom: 2 * MM } },
      h(Text, { style: { fontSize: 4.4 * MM, fontWeight: 600, color: ink, fontFamily: "Inter" } }, values.nama),
    ),
    h(Text, { style: { position: "absolute", left: mm(51), top: mm(135.5), fontSize: 3.7 * MM, color: text, fontFamily: "Inter" } }, "Completed the required studies for program:"),
    h(Text, { style: { position: "absolute", left: mm(51), top: mm(143), fontSize: 4 * MM, fontWeight: 700, color: ink, fontFamily: "Inter" } }, values.program),
    h(Text, { style: { position: "absolute", left: mm(51), top: mm(154.5), fontSize: 3.7 * MM, color: text, fontFamily: "Inter" } }, "With overall score/grade:"),
    h(Text, { style: { position: "absolute", left: mm(51), top: mm(162), fontSize: 4 * MM, fontWeight: 700, color: ink, fontFamily: "Inter" } }, values.nilai_akhir),
    h(Text, { style: { position: "absolute", left: mm(51), top: mm(171.5), fontSize: 3.7 * MM, color: text, fontFamily: "Inter" } }, "Grade score detail:"),
    // Score table: rows with thin rules, the header row bold.
    h(View, { style: { position: "absolute", left: mm(51), top: mm(178), right: mm(22) } },
      [
        ["Component", "Score", "Grade"],
        ["Listening", values.listening_nilai, values.listening_grade],
        ["Speaking", values.speaking_nilai, values.speaking_grade],
        ["Reading", values.reading_nilai, values.reading_grade],
        ["Writing", values.writing_nilai, values.writing_grade],
      ].map((row, r) =>
        h(View, { key: r, style: { flexDirection: "row", height: 8.2 * MM, borderBottomWidth: 0.25 * MM, borderBottomColor: "#8C8C8C", borderTopWidth: r === 0 ? 0.25 * MM : 0, borderTopColor: "#8C8C8C", alignItems: "center" } },
          h(Text, { style: { width: "41%", fontSize: 3.4 * MM, color: ink, paddingLeft: 2 * MM, fontFamily: "Inter", fontWeight: r === 0 ? 700 : 400 } }, row[0]),
          h(Text, { style: { width: "25%", fontSize: 3.4 * MM, color: ink, paddingLeft: 2 * MM, fontFamily: "Inter", fontWeight: r === 0 ? 700 : 400 } }, row[1]),
          h(Text, { style: { width: "34%", fontSize: 3.4 * MM, color: ink, paddingLeft: 2 * MM, fontFamily: "Inter", fontWeight: r === 0 ? 700 : 400 } }, row[2]),
        )),
    ),
    h(Text, { style: { position: "absolute", left: mm(51), top: mm(226.5), fontSize: 3.7 * MM, color: text, fontFamily: "Inter" } },
      "Periode of Study: ", h(Text, { style: { fontWeight: 700, color: ink } }, `${values.mulai} to ${values.selesai}`)),
    // Signature block, right side. The 3 x 4 photo box is gone by the owner's decision.
    h(View, { style: { position: "absolute", right: mm(22), top: mm(239.5), width: mm(60), textAlign: "center" } },
      h(Text, { style: { fontSize: 3.6 * MM, color: text, fontFamily: "Inter" } }, "awarded on"),
      h(Text, { style: { marginTop: 1 * MM, fontSize: 4 * MM, fontWeight: 600, color: ink, fontFamily: "Inter" } }, values.tanggal),
      h(Text, { style: { marginTop: 9 * MM, paddingBottom: 1 * MM, borderBottomWidth: 0.3 * MM, borderBottomColor: ink, fontSize: 3.9 * MM, color: ink, fontFamily: "Inter" } }, values.penanda_tangan),
      h(Text, { style: { marginTop: 1.5 * MM, fontSize: 4.1 * MM, color: ink, fontFamily: "Inter" } }, values.jabatan),
    ),
  );
}

/* ---------- TOEFL Prediction and IELTS Prediction, A4 landscape ---------- */

function LandscapeCertificate({ values, variant }) {
  const navy = variant === "ielts" ? "#1B3A6B" : "#141414";
  const gold = "#C9A24A";
  const ribbonFill = "#D4B069";
  return h(Page, { size: { width: 842, height: 595 }, style: { backgroundColor: "#FBF8EC", position: "relative", color: navy } },
    // Frame art from frame.svg: guilloche rings are dropped (pattern fills are heavy) and the
    // lace band simplified to the two crisp inner rules plus the corner wave runs.
    h(Svg, { style: { position: "absolute", top: 0, left: 0 }, width: mm(297), height: mm(210), viewBox: "0 0 1600 1131" },
      h(Rect, { x: 0, y: 0, width: 1600, height: 1131, fill: "#FBF8EC" }),
      h(Rect, { x: 14, y: 14, width: 1572, height: 1103, fill: "none", stroke: gold, strokeWidth: 15, strokeDasharray: "0.1 24", opacity: 0.55 }),
      h(Rect, { x: 90, y: 90, width: 1420, height: 951, fill: "none", stroke: gold, strokeWidth: 2.4 }),
      h(Rect, { x: 99, y: 99, width: 1402, height: 933, fill: "none", stroke: gold, strokeWidth: 1 }),
      h(Path, { d: "M0 6 Q7 1 14 6 T28 6", stroke: gold, strokeWidth: 1.3, fill: "none" }),
    ),
    // Masthead
    h(View, { style: { position: "absolute", top: mm(23), left: 0, right: 0, alignItems: "center" } },
      h(Image, { src: logoData("gold"), style: { width: mm(52), height: mm(8.8), marginBottom: 4 * MM } }),
      h(Text, { style: { fontSize: 3.3 * MM, color: navy, fontFamily: "Inter" } }, "SK DIKNAS NO. 421.9/985/418.20/2021"),
      h(Text, { style: { fontSize: 3.15 * MM, color: navy, lineHeight: 1.55, fontFamily: "Inter" } }, "Head Office: Jl. Brawijaya No. 75, Kampung Inggris Pare, Kediri, Jawa Timur"),
      h(Text, { style: { fontSize: 3.15 * MM, color: navy, lineHeight: 1.55, fontFamily: "Inter" } }, "Hp: 0823-3314-3544 | E-mail: admin@titiknolenglish.com | Website: titiknolenglish.com"),
      h(Ornament, { color: gold }),
    ),
    h(Text, { style: { position: "absolute", top: mm(56.5), left: 0, right: 0, textAlign: "center", fontSize: 9.2 * MM, fontWeight: 800, fontFamily: "Inter", color: navy } },
      variant === "ielts" ? "IELTS SIMULATION" : "TOEFL PREDICTION"),
    h(Text, { style: { position: "absolute", top: mm(68.5), left: 0, right: 0, textAlign: "center", fontSize: 3.3 * MM, fontFamily: "Inter", color: navy } },
      variant === "ielts" ? `No. certificate: ${values.nomor}` : `No. Certificate: ${values.nomor}`),
    h(Text, { style: { position: "absolute", top: mm(76), left: 0, right: 0, textAlign: "center", fontSize: 10.6 * MM, fontFamily: "Gelasio", fontWeight: 400, color: navy } }, "Certificate of Achievement"),
    // Ribbon with notched ends, drawn as a polygon.
    h(View, { style: { position: "absolute", top: mm(87.3), left: "50%", marginLeft: mm(-31) } },
      h(Svg, { width: mm(62), height: mm(8.8), viewBox: "0 0 62 8.8" },
        h(Polygon, { points: "0,0 62,0 60.45,4.4 62,8.8 0,8.8 1.55,4.4", fill: ribbonFill }),
      ),
      h(Text, { style: { position: "absolute", top: 0, left: 0, right: 0, height: mm(8.8), textAlign: "center", verticalAlign: "middle", fontSize: 3.9 * MM, color: "#FFFFFF", fontFamily: "Inter" } }, "This is to certify that"),
    ),
    // Score block
    h(View, { style: { position: "absolute", top: mm(98), left: "31.9%", width: "37%" } },
      h(Text, { style: { fontSize: 5.6 * MM, fontWeight: 600, lineHeight: 1.15, paddingBottom: 2.2 * MM, borderBottomWidth: 0.5 * MM, borderBottomColor: navy, textAlign: "center", fontFamily: "Gelasio", color: navy } }, values.nama),
      h(Text, { style: { marginTop: 4 * MM, fontSize: 3.8 * MM, lineHeight: 1.5, color: navy, fontFamily: "Inter" } },
        variant === "ielts" ? "achieved the following scores on the" : "achieved the following scores on the"),
      variant === "ielts" ? h(Text, { style: { marginTop: 3.2 * MM, fontSize: 3.8 * MM, lineHeight: 1.5, color: navy, fontFamily: "Inter" } }, "International English Language Testing System") : null,
      h(View, { style: { marginTop: variant === "ielts" ? 3.4 * MM : 8 * MM } },
        (variant === "ielts"
          ? [["Writing", values.writing], ["Speaking", values.speaking], ["IELTS Prediction Score", values.skor_akhir]]
          : [["Listening Comprehension", values.listening], ["Structure Comprehension", values.structure], ["Reading Comprehension", values.reading], ["Average Score", values.skor_akhir]]
        ).map(([label, score], i) =>
          h(View, { key: i, style: { flexDirection: "row", justifyContent: "space-between", fontSize: 3.8 * MM, lineHeight: 1.95, fontFamily: "Inter", color: navy } },
            h(Text, { style: { fontWeight: 400, color: navy } }, label),
            h(Text, { style: { fontWeight: 600, color: navy } }, score),
          )),
      ),
    ),
    // Signature block
    h(View, { style: { position: "absolute", top: mm(136), right: "8.2%", width: "27%", alignItems: "flex-end" } },
      h(Text, { style: { fontSize: 3.4 * MM, color: navy, fontFamily: "Inter" } }, "awarded on ", h(Text, { style: { fontWeight: 600, color: navy } }, values.tanggal)),
      h(Image, { src: logoData("blue"), style: { width: mm(50), height: mm(8.5), marginTop: 4.2 * MM } }),
      h(Text, { style: { marginTop: 8 * MM, paddingBottom: 1.4 * MM, borderBottomWidth: 0.4 * MM, borderBottomColor: navy, fontSize: 4.2 * MM, fontWeight: 500, fontFamily: "Inter", color: navy } }, values.penanda_tangan),
      h(Text, { style: { marginTop: 1.6 * MM, fontSize: 4.6 * MM, color: navy, fontFamily: "Inter" } }, values.jabatan),
    ),
    h(View, { style: { position: "absolute", left: "7.8%", bottom: mm(26), width: "34%" } },
      h(Text, { style: { fontSize: 2.35 * MM, lineHeight: 1.6, color: navy, fontFamily: "Inter" } }, "This certificate is valid for 1 year."),
      variant === "ielts" ? h(Text, { style: { fontSize: 2.35 * MM, lineHeight: 1.6, color: navy, fontFamily: "Inter" } }, "IELTS is a registered trademark of IDP and British Council.") : null,
      variant === "ielts" ? h(Text, { style: { fontSize: 2.35 * MM, lineHeight: 1.6, color: navy, fontFamily: "Inter" } }, "No affiliation between IDP, British Council, and Titik Nol English Course is applied.") : null,
    ),
  );
}

/* ---------- assembly ---------- */

const SAMPLES = {
  completion: {
    nomor: "146/MoM/MKT/TNEC/XI/2026", nama: "Rani Puspita", tanggal: "15 November 2026",
    penanda_tangan: "Yosua Ignatius Manullang", jabatan: "Chief Education Officer",
    program: "General English, Level Intermediate", nilai_akhir: "87 / 100, Grade A",
    listening_nilai: "88", listening_grade: "A", speaking_nilai: "85", speaking_grade: "A",
    reading_nilai: "90", reading_grade: "A", writing_nilai: "84", writing_grade: "B",
    mulai: "2026-08-12", selesai: "2026-11-15",
  },
  toefl: {
    nomor: "146/TFL/TNEC/XI/2026", nama: "Rani Puspita", tanggal: "15 November 2026",
    penanda_tangan: "Ufan Abdurrahman, S.Pd", jabatan: "Kepala Akademik",
    listening: "52", structure: "48", reading: "55", skor_akhir: "517",
  },
  ielts: {
    nomor: "146/IEL/TNEC/XI/2026", nama: "Rani Puspita", tanggal: "15 November 2026",
    penanda_tangan: "Yosua Ignatius Manullang", jabatan: "Chief Education Officer",
    writing: "6.5", speaking: "7.0", skor_akhir: "6.5",
  },
};

/** Renders one certificate to PDF bytes. templateKey is the TEMPLATES key (completion, toefl,
 *  ielts); values are the filled template values. Throws on unknown templates. */
export async function renderCertificatePdf(templateKey, values) {
  registerFonts();
  if (!["completion", "toefl", "ielts"].includes(templateKey)) {
    throw new Error(`Template sertifikat tidak dikenal: ${templateKey}`);
  }
  const doc = h(Document, null,
    templateKey === "completion"
      ? h(CompletionCertificate, { values })
      : h(LandscapeCertificate, { values, variant: templateKey === "toefl" ? "toefl" : "ielts" }));
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const buffer = await renderToBuffer(doc);
  return buffer;
}

export { SAMPLES as CERTIFICATE_PDF_SAMPLES };
