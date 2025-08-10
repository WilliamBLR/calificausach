import React, { useEffect, useMemo, useRef, useState } from "react";

// Califica Profesores USACH — v10 (Primera versión WEB oficial)
// Cambios:
// 1) Exportar / Importar JSON SOLO visible y usable para Admin (PIN: Cacaman91_ en demo)
// 2) Nueva pestaña "Estadisticas" con métricas por ramo (separado del Inicio)
//    - Promedio general, mejor profesor, profesor con mas opiniones
//    - Top 5 por promedio y por numero de opiniones
//    - Mini grafico de distribucion de notas del ramo (ASCII bars simple para evitar libs)
//    - Selector de ramo dentro de la vista de estadisticas
// 3) Se mantienen mejoras v9: autocomplete estilizado, tema claro/oscuro con emoji, normalizacion sin acentos, dedupe, crear ramo tras aceptar solicitud, mobile-first, info actualizada

// ======== Cursos base ========
const BASE_COURSES = [
  "Cálculo I",
  "Cálculo II",
  "Cálculo III",
  "Álgebra I",
  "Álgebra II",
  "Física I",
  "Física II",
  "Electricidad y Magnetismo",
  "Química",
  "Fundamentos de Economía",
  "Fundamentos de Programación",
  // Nuevos
  "Ingles",
  "TDI",
  "Analisis Estadistico",
  "Metodos Numericos",
];

// ======== Storage Keys ========
const STORAGE_KEY = "usach-prof-ratings-v10";
const REQUESTS_KEY = "usach-requests-v10";
const ADMIN_FLAG = "usach-admin-ok";
const ADMIN_PIN = "Cacaman91_"; // Nota: demo
const THEME_KEY = "usach-theme"; // "dark" | "light"

// ======== Utils ========
function load(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function classNames(...c) { return c.filter(Boolean).join(" "); }
function round1(x) { return Math.round(x * 10) / 10; }
function uuid() { return (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now()); }
function getAvg(reviews) { if (!reviews || reviews.length === 0) return 0; return reviews.reduce((a, r) => a + (Number(r.rating) || 0), 0) / reviews.length; }
function stripAccents(s = "") { return s.normalize("NFD").replace(/\p{Diacritic}/gu, ""); }
function normName(s = "") { return stripAccents(String(s).toLowerCase().trim().replace(/\s+/g, " ")); }
function displayName(s = "") { const no = stripAccents(String(s).trim().replace(/\s+/g, " ")); return no.replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase()); }

function avgColor(x) {
  if (x >= 9.5) return "bg-cyan-500/20 text-cyan-700 border-cyan-700/30 dark:text-cyan-300 dark:border-cyan-400/30";
  if (x >= 7) return "bg-emerald-500/15 text-emerald-700 border-emerald-700/25 dark:text-emerald-300 dark:border-emerald-400/25";
  if (x >= 4) return "bg-amber-500/20 text-amber-700 border-amber-700/30 dark:text-amber-300 dark:border-amber-400/30";
  return "bg-rose-500/20 text-rose-700 border-rose-700/30 dark:text-rose-300 dark:border-rose-400/30";
}

// ======== UI: Stars, Cards, Buttons ========
function RatingStars({ value, size = 18 }) {
  const stars = (value / 10) * 5; const full = Math.floor(stars); const frac = stars - full;
  return (
    <div className="flex items-center gap-0.5" aria-label={`Promedio ${round1(value)}/10`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} filled={i < full} frac={i === full ? frac : i < full ? 1 : 0} size={size} />
      ))}
    </div>
  );
}
function Star({ filled, frac, size }) {
  const id = React.useMemo(() => Math.random().toString(36).slice(2), []);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset={`${Math.max(0, Math.min(1, frac)) * 100}%`} stopColor="currentColor" />
          <stop offset={`${Math.max(0, Math.min(1, frac)) * 100}%`} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.88L18.18 22 12 18.56 5.82 22 7 14.15l-5-4.88 6-1.01L12 2z"
        fill={filled ? "currentColor" : `url(#g-${id})`} stroke="currentColor" strokeWidth="1.2" opacity={filled || frac > 0 ? 1 : 0.35} />
    </svg>
  );
}
function GlassCard({ children, className, theme }) {
  return (
    <div className={classNames(
      "rounded-2xl p-5 backdrop-blur-md border shadow-[0_8px_30px_rgba(2,6,23,0.15)]",
      theme === "light" ? "bg-white/70 border-slate-200" : "bg-white/5 border-white/10",
      className
    )}>{children}</div>
  );
}
function IconToggle({ onClick, isLight }) {
  return (
    <button onClick={onClick} aria-label="Cambiar tema" title="Cambiar tema"
      className={classNames("px-3 py-2 rounded-xl border text-sm transition min-h-[40px] flex items-center justify-center",
        isLight ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-white/5 hover:bg-white/10 border-white/10")}
    >
      <span className="text-lg" role="img" aria-hidden>{isLight ? "🌙" : "☀️"}</span>
    </button>
  );
}
function NavButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={classNames(
      "px-3 py-2 rounded-xl border text-sm transition touch-manipulation min-h-[40px]",
      active ? "bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border-cyan-400/40" : "bg-white/5 hover:bg-white/10 border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
    )}>{children}</button>
  );
}

// ======== Autocomplete estilizado ========
function AutoCompleteInput({ value, onChange, placeholder, suggestions, theme, name }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const isLight = theme === "light";

  const filtered = useMemo(() => {
    const q = normName(value);
    const list = suggestions.filter((s) => normName(s).includes(q));
    return list.slice(0, 8);
  }, [value, suggestions]);

  useEffect(() => { if (value && filtered.length > 0) setOpen(true); else setOpen(false); setHighlight(0); }, [value, filtered.length]);

  function handleKey(e) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { if (filtered[highlight]) { onChange(filtered[highlight]); setOpen(false); } }
    else if (e.key === "Escape") { setOpen(false); }
  }

  function handleBlur() { setTimeout(() => setOpen(false), 120); }

  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => { if (filtered.length > 0) setOpen(true); }}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={classNames("mt-2 w-full px-3 py-2 rounded-xl focus:outline-none focus:ring-2",
          isLight ? "bg-white border border-slate-200 focus:ring-violet-400/30" : "bg-white/5 border border-white/10 focus:ring-violet-400/50")}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className={classNames(
          "absolute z-10 mt-1 w-full rounded-xl border overflow-hidden",
          isLight ? "bg-white border-slate-200" : "bg-slate-900/90 border-white/10 backdrop-blur"
        )}>
          {filtered.map((opt, idx) => (
            <button type="button" key={opt}
              className={classNames("w-full text-left px-3 py-2 text-sm",
                idx === highlight ? (isLight ? "bg-cyan-50" : "bg-white/10") : "",
                "hover:bg-white/10")}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
            >
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                <span className="truncate">{opt}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ======== Seed (normalizado) ========
const SEED = {
  "Cálculo I": [
    "Moyka Verdugo","Manuel Avalos","Karina Matamala","Nicolas Munoz","Nestor Ahumada","Carolina Martinez","Daniel Saa","Juan Jimenez","Pedro Avila","Lina Silva","Oscar Lopez","Mauricio Bravo","Isidro Cornejo","Christian Drogget","Gerald Torres","Isabel Escobar",
    "Osvaldo Baeza","Pablo Garcia","Jaime Contreras","Gonzalo Castro","Diego Carvajal","Inge Alicera","Tomas Seguel","Manuel Galaz","Victor Castillo","Maria Escobar","Patricia Cuello"
  ],
  "Álgebra I": [
    "Gerald Torres","Nestor Ahumada","Manuel Avalos","Marcela Ilabaca","Ivan Morales","Pablo Diaz","Jonathan Conejeros","Alma Armijo","Gicella Veliz","Juan Jimenez","Veronica Angel",
    "Patricia Limmer","Luis Riveros","Mario Vega","Claudio Leal","Francisco Castillo","John Baquedano","Axel Silva","Maritza Cuevas","Alvaro Hidalgo","Diego Carvajal","Jose Molina","Pedro Avila"
  ],
  "Física I": [
    "Susana Lagos","Brayan Alvarez","Juan Jimenez","Rodrigo Lopez","Alberto Navarrete","Carlos Curin","Francisco Martinez","Guillermo Fuhrer","Ariel Angulo","Nibaldo Cabrini","Claudio Rojas","Carolina Ibanez","Rodrigo Canto","Fernanda Alarcon","Fernando Castillo","Natalia Valderrama",
    "Sebastian Bahamondes","Marcel Lopez","Javier Enriquez","Pamela Franco","Mario Munos Riffo","Victor Pena","Ricardo Rivera","Marcia Melendez","Cecilia Montero","Daniel Valenzuela","Alemith Geertds","Rene Zuniga","Rodrigo Canto Moller"
  ],
  "Química": ["Ruben Pastene","Mauricio Lucero","Herna Barrientos","Andrea Valdebenito","Karen Brown","Edmundo Rios","Paulina Palma"],
  "Cálculo II": ["John Baquedano","Alma Armijo","Sebastian Puelma","Cristian Caceres","Claudio Leal","Jose Ramirez","Victor Castillo","Francisco Castillo"],
  "Álgebra II": ["Michael Yanez","Isidro Cornejo","Leonardo Rosas","Francisco Castillo","Isabel Otarola","Alma Armijo"],
  "Física II": ["Brayan Alvarez","Sidney Villagran","Juan Jimenez","Marcel Lopez","Leonardo Bartolo","Carlos Vasconcellos","Marcia Melendez","Ricardo Rivera","Carlos Castillo Rivera","Moira Venegas","Mauricio Silva"],
  "Fundamentos de Programación": ["Alejandro Cisterna","Julio Fuentealba","Cristian Sepulveda","Juan Gonzales Reyes","Felipe Fuentes","Matias Tobar","Carlos Vera","Javier Salazar"],
  "Fundamentos de Economía": ["Paola Reyes","Ilse Klapp","Francisco Anguita","Felipe Martin","Felipe Gormaz"],
  "Cálculo III": ["Esteban Gutierrez","Aldo Zambrano","Daniel Saa","Julio Rincon","Diego Carvajal"],
};

function normalizeSeedNames(seed) {
  const out = {};
  for (const [course, list] of Object.entries(seed)) {
    const seen = new Set(); out[course] = [];
    for (const raw of list) { const n = displayName(raw); const key = normName(n); if (seen.has(key)) continue; seen.add(key); out[course].push(n); }
  }
  return out;
}
function normalizeAndMergeStore(store) {
  const next = {};
  for (const [course, profMap] of Object.entries(store || {})) {
    const map = {};
    for (const [name, data] of Object.entries(profMap || {})) {
      const clean = displayName(name); const k = normName(clean);
      if (!map[k]) map[k] = { name: clean, reviews: [] };
      const reviews = (data.reviews || []).map((r) => ({ ...r, id: r.id || r.date }));
      map[k].reviews = [...map[k].reviews, ...reviews];
    }
    next[course] = {}; for (const k of Object.keys(map)) next[course][map[k].name] = { reviews: map[k].reviews };
  }
  return next;
}
function mergeSeedIntoStore(store) {
  const normalizedSeed = normalizeSeedNames(SEED);
  const base = normalizeAndMergeStore(store);
  for (const c of BASE_COURSES) base[c] = base[c] || {};
  for (const [course, list] of Object.entries(normalizedSeed)) {
    base[course] = base[course] || {};
    for (const name of list) { if (!base[course][name]) base[course][name] = { reviews: [] }; }
  }
  return base;
}

const STATUS_COLORS = {
  "en revisión": "bg-amber-500/20 text-amber-700 border-amber-700/30 dark:text-amber-300 dark:border-amber-400/30",
  aceptada: "bg-emerald-500/20 text-emerald-700 border-emerald-700/30 dark:text-emerald-300 dark:border-emerald-400/30",
  rechazada: "bg-rose-500/20 text-rose-700 border-rose-700/30 dark:text-rose-300 dark:border-rose-400/30",
};

export default function App() {
  const [courses, setCourses] = useState(() => [...BASE_COURSES]);
  const [store, setStore] = useState(() => mergeSeedIntoStore(load(STORAGE_KEY, {})));
  const [requests, setRequests] = useState(() => load(REQUESTS_KEY, []));
  const [tab, setTab] = useState("home"); // home | addCourse | info | stats
  const [course, setCourse] = useState(BASE_COURSES[0]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // {course, name}
  const [adminMode, setAdminMode] = useState(() => sessionStorage.getItem(ADMIN_FLAG) === "1");
  const [theme, setTheme] = useState(() => load(THEME_KEY, "dark"));

  // Form state para autocomplete
  const [formProf, setFormProf] = useState("");

  const fileRef = useRef(null);

  useEffect(() => save(STORAGE_KEY, store), [store]);
  useEffect(() => save(REQUESTS_KEY, requests), [requests]);
  useEffect(() => localStorage.setItem(THEME_KEY, JSON.stringify(theme)), [theme]);

  // Búsqueda sin acentos
  const professors = useMemo(() => {
    const c = store[course] || {};
    const items = Object.entries(c).map(([name, data]) => ({ name, ...data, avg: getAvg(data.reviews) }));
    const q = normName(query);
    return items.filter((p) => (q === "" ? true : normName(p.name).includes(q))).sort((a, b) => b.avg - a.avg);
  }, [store, course, query]);

  const totals = useMemo(() => {
    const profCount = Object.values(store[course] || {}).length;
    const allReviews = Object.values(store[course] || {}).flatMap((p) => p.reviews);
    return { profCount, reviews: allReviews.length, avg: getAvg(allReviews) };
  }, [store, course]);

  function ensureCourseExists(courseName) {
    if (!courses.includes(courseName)) setCourses((prev) => [...prev, courseName]);
    setStore((prev) => ({ ...prev, [courseName]: prev[courseName] || {} }));
  }

  function addReview(e) {
    e.preventDefault();
    const raw = e.currentTarget;
    const nameRaw = formProf.trim();
    if (!nameRaw) return;
    const r = Math.max(1, Math.min(10, Number(raw.querySelector('[name="rating"]').value)));
    const cmt = (raw.querySelector('[name="comment"]').value || "").trim();
    const normalizedKey = normName(nameRaw);
    let foundDisplay = null; const currentMap = store[course] || {};
    for (const existing of Object.keys(currentMap)) { if (normName(existing) === normalizedKey) { foundDisplay = existing; break; } }
    const display = foundDisplay || displayName(nameRaw);
    const review = { id: uuid(), rating: r, comment: cmt, date: new Date().toISOString() };
    setStore((prev) => { const next = { ...prev }; if (!next[course]) next[course] = {}; if (!next[course][display]) next[course][display] = { reviews: [] }; next[course][display] = { reviews: [review, ...next[course][display].reviews] }; return next; });
    raw.reset(); setFormProf("");
  }

  function removeReviewById(courseName, profName, id) {
    setStore((prev) => { const next = { ...prev }; const list = next[courseName]?.[profName]?.reviews || []; const filtered = list.filter((r) => (r.id || r.date) !== id); next[courseName][profName] = { reviews: filtered }; return next; });
  }

  function deleteProfessor(name) { // Solo Admin
    setStore((prev) => { const next = { ...prev }; if (next[course] && next[course][name]) delete next[course][name]; return next; });
  }

  function submitCourseRequest(e) {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    const ramo = String(form.get("ramo") || "").trim(); const detalle = String(form.get("detalle") || "").trim(); const email = String(form.get("email") || "").trim(); if (!ramo) return;
    const req = { id: uuid(), ramo, detalle, email, date: new Date().toISOString(), status: "en revisión" }; setRequests((prev) => [req, ...prev]); e.currentTarget.reset();
  }

  function updateRequestStatus(id, status) {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    const req = requests.find((x) => x.id === id);
    if (req && status === "aceptada") { const newCourse = req.ramo.trim(); ensureCourseExists(newCourse); }
  }

  function toggleAdmin() {
    if (adminMode) { setAdminMode(false); sessionStorage.removeItem(ADMIN_FLAG); alert("Modo administrador desactivado"); return; }
    const pin = window.prompt("Ingresa PIN de administrador:") || "";
    if (pin === ADMIN_PIN) { setAdminMode(true); sessionStorage.setItem(ADMIN_FLAG, "1"); alert("Modo administrador activado"); }
    else if (pin !== "") { alert("PIN incorrecto"); }
  }

  // ===== Exportar / Importar JSON (SOLO Admin) =====
  function handleExport() {
    const payload = { version: "v10", courses, store, requests, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `usach-profes-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  }
  async function handleImport(ev) {
    const file = ev.target.files?.[0]; if (!file) return;
    try { const text = await file.text(); const data = JSON.parse(text); if (!data || typeof data !== "object" || !data.store) throw new Error("JSON no valido");
      const normalized = normalizeAndMergeStore(data.store); const nextStore = mergeSeedIntoStore(normalized);
      setStore(nextStore); setCourses(Array.from(new Set([...(data.courses || []), ...BASE_COURSES]))); setRequests(Array.isArray(data.requests) ? data.requests : []);
      alert("Datos importados correctamente");
    } catch { alert("No se pudo importar el archivo JSON"); } finally { ev.target.value = ""; }
  }

  const isLight = theme === "light";

  return (
    <div className={classNames(
      "min-h-screen",
      isLight ? "text-slate-900 bg-[radial-gradient(1200px_600px_at_80%_-20%,rgba(14,165,233,0.12),transparent),radial-gradient(1000px_500px_at_10%_10%,rgba(139,92,246,0.12),transparent)] bg-slate-50" : "text-slate-100 bg-[radial-gradient(1200px_600px_at_80%_-20%,rgba(56,189,248,0.25),transparent),radial-gradient(1000px_500px_at_10%_10%,rgba(168,85,247,0.20),transparent)] bg-slate-950",
      isLight ? "light" : "dark"
    )}>
      <header className={classNames(
        "sticky top-0 z-20 backdrop-blur border-b",
        isLight ? "supports-[backdrop-filter]:bg-white/70 bg-white/80 border-slate-200" : "supports-[backdrop-filter]:bg-slate-950/60 bg-slate-950/80 border-white/10"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow" />
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-semibold tracking-tight truncate">Califica Profesores — USACH · Módulo Básico</h1>
            <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 truncate">Cálculo, Álgebra, Física, Electricidad y Magnetismo, Química, Economía, Programación</p>
          </div>
          <nav className="ml-auto flex items-center gap-2">
            <NavButton active={tab === "home"} onClick={() => setTab("home")}>Inicio</NavButton>
            <NavButton active={tab === "addCourse"} onClick={() => setTab("addCourse")}>Agregar ramo</NavButton>
            <NavButton active={tab === "stats"} onClick={() => setTab("stats")}>Estadisticas</NavButton>
            <NavButton active={tab === "info"} onClick={() => setTab("info")}>Información</NavButton>
            <IconToggle onClick={() => setTheme(isLight ? "dark" : "light")} isLight={isLight} />
            <button onClick={toggleAdmin} className={classNames(
              "px-3 py-2 rounded-xl border text-sm transition min-h-[40px]",
              adminMode ? (isLight ? "bg-emerald-500/10 border-emerald-600/30" : "bg-emerald-500/20 border-emerald-400/40") : (isLight ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-white/5 hover:bg-white/10 border-white/10")
            )} title="Alternar modo administrador">{adminMode ? "Admin ON" : "Admin OFF"}</button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-5 py-6 sm:py-8 grid gap-5 sm:gap-8">
        {/* HOME */}
        {tab === "home" && !selected && (
          <>
            <GlassCard theme={theme}>
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 sm:gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-slate-600 dark:text-slate-300">Selecciona un ramo</label>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {courses.map((c) => (
                      <button key={c} onClick={() => setCourse(c)} className={classNames(
                        "px-3 py-2 rounded-xl border text-sm transition touch-manipulation min-h-[40px]",
                        course === c
                          ? "bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border-cyan-400/40"
                          : (isLight ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-white/5 hover:bg-white/10 border-white/10")
                      )}>{c}</button>
                    ))}
                  </div>
                </div>
                <div className="w-full lg:w-64">
                  <label className="block text-sm text-slate-600 dark:text-slate-300">Buscar profesor</label>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre…"
                    className={classNames("mt-2 w-full px-3 py-2 rounded-xl focus:outline-none focus:ring-2",
                      isLight ? "bg-white border border-slate-200 focus:ring-cyan-400/40" : "bg-white/5 border border-white/10 focus:ring-cyan-400/50")}
                  />
                </div>
                <div className="w-full lg:w-64">
                  <label className="block text-sm text-slate-600 dark:text-slate-300">Resumen del ramo</label>
                  <div className={classNames("mt-2 p-3 rounded-xl",
                    isLight ? "bg-white border border-slate-200" : "bg-white/5 border border-white/10")}
                  >
                    <div className="text-xs text-slate-600 dark:text-slate-400">Promedio general</div>
                    <div className="flex items-center gap-2 mt-1"><RatingStars value={totals.avg} /><span className="text-sm">{round1(totals.avg)}/10</span></div>
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">Profesores: <span className="font-medium">{totals.profCount}</span> · Opiniones: <span className="font-medium">{totals.reviews}</span></div>
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard theme={theme}>
              <form onSubmit={addReview} className="grid md:grid-cols-5 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-sm text-slate-600 dark:text-slate-300">Profesor(a)</label>
                  <AutoCompleteInput
                    name="prof"
                    value={formProf}
                    onChange={setFormProf}
                    placeholder="Ej: Ana Perez"
                    suggestions={Object.keys(store[course] || {})}
                    theme={theme}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-300">Nota (1 a 10)</label>
                  <input name="rating" type="number" min={1} max={10} step={1}
                    className={classNames("mt-2 w-full px-3 py-2 rounded-xl focus:outline-none focus:ring-2",
                      isLight ? "bg-white border border-slate-200 focus:ring-cyan-400/30" : "bg-white/5 border border-white/10 focus:ring-cyan-400/50")}
                    defaultValue={8} required />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-slate-600 dark:text-slate-300">Comentario (opcional)</label>
                  <input name="comment" placeholder="Breve comentario" className={classNames("mt-2 w-full px-3 py-2 rounded-xl focus:outline-none focus:ring-2",
                    isLight ? "bg-white border border-slate-200 focus:ring-cyan-400/30" : "bg-white/5 border border-white/10 focus:ring-cyan-400/50")}
                  />
                </div>
                <div className="sticky bottom-3 md:static">
                  <div className="flex gap-2">
                    <button type="submit" className={classNames(
                      "w-full px-4 py-2 rounded-xl transition shadow-lg touch-manipulation min-h-[44px]",
                      isLight ? "bg-gradient-to-br from-cyan-500 to-violet-600 text-white hover:from-cyan-400 hover:to-violet-500" : "bg-gradient-to-br from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500"
                    )}>Agregar opinion</button>
                    {adminMode && (
                      <>
                        <button type="button" onClick={handleExport} className={classNames(
                          "px-3 py-2 rounded-xl border text-sm min-h-[44px]",
                          isLight ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-white/5 hover:bg-white/10 border-white/10"
                        )}>Exportar JSON</button>
                        <button type="button" onClick={() => fileRef.current?.click()} className={classNames(
                          "px-3 py-2 rounded-xl border text-sm min-h-[44px]",
                          isLight ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-white/5 hover:bg-white/10 border-white/10"
                        )}>Importar JSON</button>
                        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
                      </>
                    )}
                  </div>
                </div>
              </form>
            </GlassCard>

            <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {professors.length === 0 ? (
                <div className="sm:col-span-2 lg:col-span-3 text-center text-slate-500 dark:text-slate-400">Aun no hay profesores registrados para <span className="font-medium">{course}</span>. ¡Se el primero en opinar!</div>
              ) : (
                professors.map((p, idx) => (
                  <ProfessorCard key={p.name} course={course} data={p} isTop={idx === 0}
                    onDelete={deleteProfessor} adminMode={adminMode}
                    onOpenProfile={(name) => setSelected({ course, name })}
                    onRemoveReview={(id) => removeReviewById(course, p.name, id)} theme={theme}
                  />
                ))
              )}
            </section>
          </>
        )}

        {/* PERFIL */}
        {tab === "home" && selected && (
          <ProfessorProfile data={store[selected.course]?.[selected.name]} name={selected.name} course={selected.course}
            onBack={() => setSelected(null)} setStore={setStore}
            removeById={(id) => removeReviewById(selected.course, selected.name, id)} theme={theme} />
        )}

        {/* AGREGAR RAMO */}
        {tab === "addCourse" && (
          <GlassCard theme={theme}>
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
              <div className="flex-1">
                <h2 className="text-lg font-semibold">¿Quieres agregar un ramo?</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Indica el nombre exacto del ramo y detalles opcionales. Tu solicitud queda guardada para revisión.</p>
                <form onSubmit={submitCourseRequest} className="mt-4 grid gap-3">
                  <div>
                    <label className="block text-sm text-slate-600 dark:text-slate-300">Nombre del ramo</label>
                    <input name="ramo" placeholder="Ej: Probabilidad y Estadistica" className={classNames("mt-2 w-full px-3 py-2 rounded-xl focus:outline-none focus:ring-2",
                      isLight ? "bg-white border border-slate-200 focus:ring-cyan-400/40" : "bg-white/5 border border-white/10 focus:ring-cyan-400/50")} required />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 dark:text-slate-300">Detalles (opcional)</label>
                    <input name="detalle" placeholder="Departamento, seccion, motivacion" className={classNames("mt-2 w-full px-3 py-2 rounded-xl focus:outline-none focus:ring-2",
                      isLight ? "bg-white border border-slate-200 focus:ring-violet-400/30" : "bg-white/5 border border-white/10 focus:ring-violet-400/50")}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 dark:text-slate-300">Correo (opcional)</label>
                    <input type="email" name="email" placeholder="tunombre@usach.cl" className={classNames("mt-2 w-full px-3 py-2 rounded-xl focus:outline-none focus:ring-2",
                      isLight ? "bg-white border border-slate-200 focus:ring-cyan-400/30" : "bg-white/5 border border-white/10 focus:ring-cyan-400/50")} />
                  </div>
                  <div className="sticky bottom-3 md:static">
                    <button type="submit" className={classNames("px-4 py-2 rounded-xl transition shadow-lg min-h-[44px]",
                      isLight ? "bg-gradient-to-br from-cyan-500 to-violet-600 text-white hover:from-cyan-400 hover:to-violet-500" : "bg-gradient-to-br from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500")}>Enviar solicitud</button>
                  </div>
                </form>
              </div>
              <div className="w-full lg:w-[28rem]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm">Solicitudes enviadas</h3>
                  <span className={classNames("px-2 py-0.5 rounded-lg border text-xs", adminMode ? (isLight ? "bg-emerald-500/10 border-emerald-600/30" : "bg-emerald-500/15 border-emerald-400/30") : (isLight ? "bg-white border border-slate-200" : "bg-white/10 border-white/10"))}>{adminMode ? "Admin ON" : "Admin OFF"}</span>
                </div>
                <div className="mt-3 space-y-3 max-h-96 overflow-auto pr-1">
                  {requests.length === 0 ? (
                    <div className="text-slate-500 dark:text-slate-400 text-sm">No hay solicitudes aun.</div>
                  ) : (
                    requests.map((r) => (
                      <div key={r.id} className={classNames("p-3 rounded-xl", isLight ? "bg-white border border-slate-200" : "bg-white/5 border border-white/10") }>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{r.ramo}</div>
                            {r.detalle && <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{r.detalle}</div>}
                            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                              <span>{new Date(r.date).toLocaleString()}</span>
                              {r.email && (<span className={classNames("px-1.5 py-0.5 rounded", isLight ? "bg-white border border-slate-200" : "bg-white/5 border border-white/10")}>{r.email}</span>)}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={classNames("px-2 py-0.5 rounded-lg border text-xs", STATUS_COLORS[r.status] || (isLight ? "bg-white border border-slate-200" : "bg-white/10 border-white/10"))}>{r.status}</span>
                            {adminMode && (
                              <select value={r.status} onChange={(e) => updateRequestStatus(r.id, e.target.value)} className={classNames("text-xs rounded-lg px-2 py-1 focus:outline-none",
                                isLight ? "bg-white border border-slate-200" : "bg-white/5 border border-white/10")}
                              >
                                <option value="en revisión">en revisión</option>
                                <option value="aceptada">aceptada</option>
                                <option value="rechazada">rechazada</option>
                              </select>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        {/* ESTADISTICAS */}
        {tab === "stats" && (
          <GlassCard theme={theme}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <h2 className="text-lg font-semibold">Estadisticas por Ramo</h2>
                <div className="sm:ml-auto w-full sm:w-72">
                  <label className="block text-sm text-slate-600 dark:text-slate-300">Selecciona un ramo</label>
                  <select value={course} onChange={(e) => setCourse(e.target.value)} className={classNames("mt-2 w-full px-3 py-2 rounded-xl focus:outline-none",
                    isLight ? "bg-white border border-slate-200" : "bg-white/5 border border-white/10")}
                  >
                    {courses.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
              </div>

              <StatsPanel store={store} course={course} theme={theme} />

              {adminMode && (
                <div className="mt-2 flex gap-2">
                  <button onClick={handleExport} className={classNames("px-3 py-2 rounded-xl border text-sm",
                    isLight ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-white/5 hover:bg-white/10 border-white/10")}>Exportar JSON</button>
                  <button onClick={() => fileRef.current?.click()} className={classNames("px-3 py-2 rounded-xl border text-sm",
                    isLight ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-white/5 hover:bg-white/10 border-white/10")}>Importar JSON</button>
                  <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
                </div>
              )}
            </div>
          </GlassCard>
        )}

        {/* INFO (actualizada) */}
        {tab === "info" && (
          <GlassCard theme={theme}>
            <h2 className="text-lg font-semibold">Acerca del proyecto</h2>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              Esta plataforma fue creada por estudiantes de la Universidad de Santiago de Chile con el objetivo de ayudar a otros
              estudiantes a elegir profesores y compartir experiencias. Las opiniones publicadas son personales y <strong>no representan a quienes desarrollan este sitio</strong>.
              Evita lenguaje ofensivo; los comentarios pueden ser moderados.
            </p>
            <ul className="mt-3 text-sm list-disc pl-5 text-slate-700 dark:text-slate-300 space-y-1">
              <li>Califica con nota 1–10 y comentario opcional.</li>
              <li>El promedio se muestra con estrellas; el mejor profesor del ramo aparece como “El mas recomendado”.</li>
              <li>Para solicitar nuevos ramos, usa la pestaña “Agregar ramo”. Si se acepta, el ramo se añade automáticamente.</li>
              <li>Proyecto experimental y sin fines de lucro.</li>
            </ul>
          </GlassCard>
        )}

        <footer className="py-8 text-center text-xs text-slate-600 dark:text-slate-500">
          <div className="flex items-center justify-center gap-2">
            <span>© 2025 · Proyecto estudiantil USACH</span>
            <span>·</span>
            <a className="underline decoration-cyan-400/60 hover:decoration-cyan-300" href="#">Aviso Legal y Privacidad</a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function StatsPanel({ store, course, theme }) {
  const isLight = theme === "light";
  const c = store[course] || {};
  const list = Object.entries(c).map(([name, data]) => ({ name, reviews: data.reviews || [], avg: getAvg(data.reviews || []) }));
  const bestByAvg = [...list].filter(p=>p.reviews.length>0).sort((a,b)=> b.avg - a.avg)[0] || null;
  const mostReviewed = [...list].sort((a,b)=> b.reviews.length - a.reviews.length)[0] || null;

  // Top 5
  const topAvg = [...list].filter(p=>p.reviews.length>0).sort((a,b)=> b.avg - a.avg).slice(0,5);
  const topCount = [...list].sort((a,b)=> b.reviews.length - a.reviews.length).slice(0,5);

  // Distribución de notas (1..10)
  const distro = Array.from({ length: 10 }, (_, i) => ({ score: i+1, count: 0 }));
  for (const p of list) for (const r of p.reviews) distro[r.rating-1].count++;
  const maxBar = Math.max(1, ...distro.map(d=>d.count));

  return (
    <div className="grid gap-5">
      <div className="grid sm:grid-cols-3 gap-3">
        <GlassMini theme={theme}>
          <div className="text-xs text-slate-600 dark:text-slate-400">Promedio general</div>
          <div className="flex items-center gap-2 mt-1"><RatingStars value={getAvg(list.flatMap(p=>p.reviews))} /><span className="text-sm">{round1(getAvg(list.flatMap(p=>p.reviews)))}/10</span></div>
        </GlassMini>
        <GlassMini theme={theme}>
          <div className="text-xs text-slate-600 dark:text-slate-400">Mejor profesor (promedio)</div>
          <div className="mt-1 text-sm font-medium">{bestByAvg ? `${bestByAvg.name} · ${round1(bestByAvg.avg)}/10` : "Sin datos"}</div>
        </GlassMini>
        <GlassMini theme={theme}>
          <div className="text-xs text-slate-600 dark:text-slate-400">Mas opiniones</div>
          <div className="mt-1 text-sm font-medium">{mostReviewed ? `${mostReviewed.name} · ${mostReviewed.reviews.length}` : "Sin datos"}</div>
        </GlassMini>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <GlassMini theme={theme}>
          <div className="text-sm font-semibold">Top 5 por promedio</div>
          <ul className="mt-2 space-y-1 text-sm">
            {topAvg.length===0 ? <li className="text-slate-500 dark:text-slate-400 text-sm">Sin datos</li> : topAvg.map((p,i)=>(
              <li key={p.name} className="flex items-center justify-between gap-2">
                <span className="truncate">{i+1}. {p.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg border">{round1(p.avg)}/10</span>
              </li>
            ))}
          </ul>
        </GlassMini>
        <GlassMini theme={theme}>
          <div className="text-sm font-semibold">Top 5 por cantidad de opiniones</div>
          <ul className="mt-2 space-y-1 text-sm">
            {topCount.length===0 ? <li className="text-slate-500 dark:text-slate-400 text-sm">Sin datos</li> : topCount.map((p,i)=>(
              <li key={p.name} className="flex items-center justify-between gap-2">
                <span className="truncate">{i+1}. {p.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg border">{p.reviews.length} op.</span>
              </li>
            ))}
          </ul>
        </GlassMini>
      </div>

      <GlassMini theme={theme}>
        <div className="text-sm font-semibold">Distribucion de notas (todas las opiniones del ramo)</div>
        <div className="mt-2 grid grid-cols-10 gap-1">
          {distro.map((d)=>(
            <div key={d.score} className="text-center">
              <div className={classNames("mx-auto w-full rounded-md", isLight ? "bg-slate-200" : "bg-white/10")} style={{ height: `${Math.max(8, (d.count/maxBar)*80)}px`}} />
              <div className="text-[10px] mt-1 text-slate-600 dark:text-slate-400">{d.score}</div>
            </div>
          ))}
        </div>
      </GlassMini>
    </div>
  );
}

function GlassMini({ children, theme }) {
  return (
    <div className={classNames(
      "rounded-xl p-4 border",
      theme === "light" ? "bg-white/70 border-slate-200" : "bg-white/5 border-white/10"
    )}>{children}</div>
  );
}

function ProfessorCard({ course, data, onDelete, onOpenProfile, onRemoveReview, isTop, adminMode, theme }) {
  const { name, reviews, avg } = data;
  const color = avgColor(round1(avg));
  const [open, setOpen] = useState(false);
  const isLight = theme === "light";

  return (
    <GlassCard theme={theme} className="group relative">
      {isTop && (
        <div className="absolute -top-2 -right-2 px-2 py-1 rounded-lg text-[11px] font-medium bg-gradient-to-br from-cyan-500/30 to-violet-500/30 border border-cyan-400/40 shadow">El mas recomendado</div>
      )}
      <div className="flex items-start gap-3">
        <div className={classNames("px-3 py-1 rounded-lg border text-xs font-medium", color)}>{round1(avg)}/10</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button onClick={() => onOpenProfile(name)} className="text-base font-semibold tracking-tight hover:underline hover:decoration-cyan-400/60 text-left truncate" title="Ver perfil del profesor">{name}</button>
            <RatingStars value={avg} />
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">{reviews.length} opinion{reviews.length !== 1 ? "es" : ""}</div>
        </div>
        <div className="flex items-center gap-2 opacity-80">
          <button title="Ver/ocultar opiniones" onClick={() => setOpen((v) => !v)} className={classNames("p-2 rounded-lg border", isLight ? "bg-white hover:bg-slate-50 border-slate-200" : "bg-white/5 hover:bg-white/10 border-white/10")}>
            {open ? (<svg width="18" height="18" viewBox="0 0 24 24" className="text-slate-600 dark:text-slate-300"><path fill="currentColor" d="M19 13H5v-2h14v2Z"/></svg>) : (<svg width="18" height="18" viewBox="0 0 24 24" className="text-slate-600 dark:text-slate-300"><path fill="currentColor" d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2Z"/></svg>)}
          </button>
          {adminMode && (
            <button title="Eliminar profesor" onClick={() => onDelete(name)} className={classNames("p-2 rounded-lg border", isLight ? "bg-white hover:bg-rose-50 border-slate-200" : "bg-white/5 hover:bg-rose-500/20 border-white/10")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" className="text-rose-600 dark:text-rose-300"><path fill="currentColor" d="M6 7h12l-1 13H7L6 7Zm3-3h6l1 2H8l1-2Z"/></svg>
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {reviews.map((r) => (
            <div key={r.id || r.date} className={classNames("p-3 rounded-xl", isLight ? "bg-white border border-slate-200" : "bg-white/5 border border-white/10") }>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-sm font-medium">Nota: {r.rating}</span><span className="text-[10px] text-slate-500">{new Date(r.date).toLocaleString()}</span></div>
                <button onClick={() => onRemoveReview(r.id || r.date)} className="text-xs text-rose-600 dark:text-rose-300 hover:underline">Eliminar</button>
              </div>
              {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function ProfessorProfile({ data, name, course, onBack, setStore, removeById, theme }) {
  if (!data) return (
    <GlassCard theme={theme}>
      <div className="flex items-center gap-3"><button onClick={onBack} className="p-2 rounded-lg border">Volver</button><div>Perfil no encontrado.</div></div>
    </GlassCard>
  );

  const avg = round1(getAvg(data.reviews));
  const color = avgColor(avg);
  const isLight = theme === "light";

  const sorted = [...data.reviews].sort((a, b) => { if (b.rating !== a.rating) return b.rating - a.rating; return new Date(b.date).getTime() - new Date(a.date).getTime(); });

  const [prRating, setPrRating] = useState(8);
  const [prComment, setPrComment] = useState("");
  function addReviewFromProfile(e) {
    e.preventDefault();
    const r = Math.max(1, Math.min(10, Number(prRating)));
    const review = { id: uuid(), rating: r, comment: prComment.trim(), date: new Date().toISOString() };
    setStore((prev) => { const next = { ...prev }; if (!next[course]) next[course] = {}; if (!next[course][name]) next[course][name] = { reviews: [] }; next[course][name] = { reviews: [review, ...(next[course][name].reviews || [])] }; return next; });
    setPrRating(8); setPrComment("");
  }

  return (
    <GlassCard theme={theme}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className={classNames("p-2 rounded-lg border", isLight ? "bg-white border-slate-200" : "bg-white/5 border-white/10")}>← Volver</button>
        <h2 className="text-lg font-semibold truncate">Perfil de {name}</h2>
        <span className="ml-auto text-xs text-slate-600 dark:text-slate-400">Ramo: <span className="font-medium">{course}</span></span>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-sm text-slate-700 dark:text-slate-300">Promedio</div>
        <RatingStars value={avg} size={22} />
        <div className={classNames("px-2 py-1 rounded-lg border text-sm", color)}>{avg}/10</div>
        <div className="text-xs text-slate-600 dark:text-slate-400">Opiniones: {data.reviews.length}</div>
      </div>

      <div className="mt-4">
        <h3 className="text-sm text-slate-700 dark:text-slate-300 mb-2">Agregar opinion para {name} — <span className="font-medium">{course}</span></h3>
        <form onSubmit={addReviewFromProfile} className="grid md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-sm text-slate-700 dark:text-slate-300">Nota (1–10)</label>
            <input type="number" min={1} max={10} step={1} value={prRating} onChange={(e) => setPrRating(e.target.value)} className={classNames("mt-1 w-full px-3 py-2 rounded-xl focus:outline-none focus:ring-2",
              isLight ? "bg-white border border-slate-200 focus:ring-cyan-400/40" : "bg-white/5 border border-white/10 focus:ring-cyan-400/50")} required />
          </div>
          <div className="md:col-span-4">
            <label className="block text-sm text-slate-700 dark:text-slate-300">Comentario (opcional)</label>
            <input value={prComment} onChange={(e) => setPrComment(e.target.value)} placeholder="Breve comentario" className={classNames("mt-1 w-full px-3 py-2 rounded-xl focus:outline-none focus:ring-2",
              isLight ? "bg-white border border-slate-200 focus:ring-violet-400/30" : "bg-white/5 border border-white/10 focus:ring-violet-400/50")} />
          </div>
          <div>
            <button type="submit" className={classNames("w-full px-4 py-2 rounded-xl transition shadow-lg min-h-[44px]",
              isLight ? "bg-gradient-to-br from-cyan-500 to-violet-600 text-white hover:from-cyan-400 hover:to-violet-500" : "bg-gradient-to-br from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500")}>Agregar</button>
          </div>
        </form>
      </div>

      <div className="mt-4 grid gap-3">
        {sorted.map((r) => (
          <div key={r.id || r.date} className={classNames("p-3 rounded-xl", isLight ? "bg-white border border-slate-200" : "bg-white/5 border border-white/10") }>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><span className="text-sm font-medium">Nota: {r.rating}</span><span className="text-[10px] text-slate-500">{new Date(r.date).toLocaleString()}</span></div>
              <button onClick={() => removeById(r.id || r.date)} className="text-xs text-rose-600 dark:text-rose-300 hover:underline">Eliminar</button>
            </div>
            {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

