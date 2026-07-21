/* ==========================================================================
   Zonnepaneelmaatje - keuzehulp
   Adviseert op basis van verbruik, dak en wensen het aantal wattpiek en de
   drie best passende panelen uit data/panelen.json.
   ========================================================================== */

(function () {
  "use strict";

  const el = (id) => document.getElementById(id);

  const eurFmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const eurWpFmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numFmt = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });

  let panelen = [];
  let omvormers = [];

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  const naamVan = (p) => p.model.toLowerCase().startsWith(p.merk.toLowerCase()) ? p.model : `${p.merk} ${p.model}`;

  function prijsPerWp(p) {
    return p.richtprijs_eur && p.vermogen_wp ? p.richtprijs_eur / p.vermogen_wp : null;
  }

  // Zelfde formule als assets/app.js en uitleg.html#zeker-score
  function zekerScore(p) {
    let score = 0;
    const g = p.garantie_product_jaar || 0;
    score += g >= 25 ? 2 : g >= 20 ? 1 : 0;
    const b = p.vermogen_behoud_25j_pct || 0;
    score += b >= 90 ? 2 : b >= 88.5 ? 1 : 0;
    score += p.uitvoering === "glas-glas" ? 2 : 0;
    return score;
  }

  function invoer() {
    const liggingRaw = el("dakligging").value;
    const platDak = liggingRaw.includes("plat");
    return {
      verbruik: Math.max(500, Number(el("verbruik").value) || 2900),
      factor: parseFloat(liggingRaw) || 0.9,
      platDak,
      maxPanelen: Math.max(2, Number(el("maxPanelen").value) || 12),
      auto: el("checkAuto").checked,
      warmtepomp: el("checkWarmtepomp").checked,
      batterij: el("checkBatterij").checked,
      voorkeur: el("voorkeur").value,
      fullBlack: el("checkFullBlack").checked,
      schaduw: el("schaduw") ? el("schaduw").value : "geen",
      slim: el("checkSlim") ? el("checkSlim").checked : false,
    };
  }

  /* ------------------------------------------------------------------
     Advies: benodigd vermogen
     ------------------------------------------------------------------ */

  function vermogenAdvies(s) {
    let doelVerbruik = s.verbruik;
    const extras = [];
    if (s.auto) { doelVerbruik += 2000; extras.push("elektrische auto (+2.000 kWh)"); }
    if (s.warmtepomp) { doelVerbruik += 2000; extras.push("warmtepomp (+2.000 kWh)"); }

    // Zonder batterij mikken we op ~100% van het (verwachte) verbruik; met
    // batterij loont iets ruimer, omdat het overschot dan zelf te gebruiken is.
    const dekkingsFactor = s.batterij ? 1.15 : 1.0;
    const benodigdWp = Math.round((doelVerbruik * dekkingsFactor) / s.factor);
    return { doelVerbruik, benodigdWp, extras };
  }

  /* ------------------------------------------------------------------
     Advies: top 3 panelen
     ------------------------------------------------------------------ */

  function scorePanelen(s, dakTeKlein) {
    // Normaliseren per criterium over de hele dataset (0 = slechtst, 1 = best)
    const prijzen = panelen.map(prijsPerWp).filter(Boolean);
    const minPrijs = Math.min(...prijzen), maxPrijs = Math.max(...prijzen);
    const rendementen = panelen.map((p) => p.rendement_pct || 0);
    const minRend = Math.min(...rendementen), maxRend = Math.max(...rendementen);

    // Weging op basis van voorkeur; bij een te klein dak telt rendement zwaarder
    let w = { prijs: 0.45, rendement: 0.2, zeker: 0.35 };
    if (s.voorkeur === "rendement") w = { prijs: 0.2, rendement: 0.55, zeker: 0.25 };
    if (s.voorkeur === "zekerheid") w = { prijs: 0.2, rendement: 0.15, zeker: 0.65 };
    if (dakTeKlein && s.voorkeur !== "rendement") { w.rendement += 0.2; w.prijs = Math.max(0.1, w.prijs - 0.2); }

    const kandidaten = panelen.filter((p) => !s.fullBlack || p.full_black);
    return kandidaten.map((p) => {
      const per = prijsPerWp(p);
      const prijsScore = per ? (maxPrijs - per) / (maxPrijs - minPrijs || 1) : 0;
      const rendScore = ((p.rendement_pct || minRend) - minRend) / (maxRend - minRend || 1);
      const zekerNorm = zekerScore(p) / 6;
      let score = w.prijs * prijsScore + w.rendement * rendScore + w.zeker * zekerNorm;
      if (s.platDak && p.bifaciaal) score += 0.05; // bifaciaal vangt bij een plat dak ook licht via de achterkant
      return { p, score, per };
    }).sort((a, b) => b.score - a.score).slice(0, 3);
  }

  function redenVoor(p, s, dakTeKlein) {
    const redenen = [];
    const per = prijsPerWp(p);
    if (per) redenen.push(`${eurWpFmt.format(per)} per Wp`);
    if ((p.rendement_pct || 0) >= 22.4) redenen.push(`hoog rendement (${String(p.rendement_pct).replace(".", ",")}%), veel opbrengst per m²`);
    if (zekerScore(p) >= 5) redenen.push(`Zeker-score ${zekerScore(p)}/6`);
    if (p.uitvoering === "glas-glas") redenen.push("glas-glas uitvoering");
    if ((p.garantie_product_jaar || 0) >= 25) redenen.push(`${p.garantie_product_jaar} jaar productgarantie`);
    if (s.platDak && p.bifaciaal) redenen.push("bifaciaal: extra opbrengst bij een plat dak");
    if (s.fullBlack && p.full_black) redenen.push("full black");
    return redenen.slice(0, 4).join(" · ");
  }

  /* ------------------------------------------------------------------
     Omvormeradvies: zelfde Koppel-score als assets/omvormers.js
     ------------------------------------------------------------------ */

  function driewaardig(v) {
    if (v && typeof v === "object") return { status: v.status || "deels", tekst: v.tekst || "" };
    if (v === true) return { status: "ja", tekst: "Ja" };
    if (typeof v === "string" && v.trim()) return { status: "deels", tekst: v };
    return { status: "nee", tekst: "Nee" };
  }

  function koppelScore(o) {
    const punt = (v) => { const st = driewaardig(v).status; return st === "ja" ? 2 : st === "deels" ? 1 : 0; };
    return punt(o.batterij) + punt(o.home_assistant) + punt(o.schaduw);
  }

  // Kies de twee best passende omvormers bij deze situatie
  function omvormerAdvies(s) {
    if (!omvormers.length) return null;
    const punt = (v) => { const st = driewaardig(v).status; return st === "ja" ? 2 : st === "deels" ? 1 : 0; };
    const prijzen = omvormers.map((o) => o.richtprijs_eur).filter(Boolean);
    const minP = Math.min(...prijzen), maxP = Math.max(...prijzen);

    const gescoord = omvormers.map((o) => {
      let score = 0;
      // Schaduw: bij veel schaduw is elektronica per paneel vrijwel een vereiste
      score += punt(o.schaduw) * (s.schaduw === "veel" ? 3 : s.schaduw === "beetje" ? 1.5 : 0.5);
      // Batterijplannen: direct koppelbaar weegt dan zwaar
      score += punt(o.batterij) * (s.batterij ? 3 : 0.75);
      // Slim aansturen: officiële integratie of open API weegt dan zwaar
      score += punt(o.home_assistant) * (s.slim ? 3 : 0.75);
      // Prijs telt altijd een beetje mee (goedkoper = beter)
      if (o.richtprijs_eur) score += 2 * (maxP - o.richtprijs_eur) / (maxP - minP || 1);
      return { o, score };
    }).sort((a, b) => b.score - a.score);
    return gescoord.slice(0, 2);
  }

  function omvormerReden(o, s) {
    const redenen = [];
    if (s.schaduw === "veel" && driewaardig(o.schaduw).status === "ja") redenen.push("elektronica per paneel: ideaal bij jouw schaduw");
    if (s.batterij && driewaardig(o.batterij).status === "ja") redenen.push("thuisbatterij direct aan te sluiten");
    if (s.slim && driewaardig(o.home_assistant).status === "ja") redenen.push("officiële slimme koppeling (Home Assistant)");
    redenen.push(`Koppel-score ${koppelScore(o)}/6`);
    if (o.garantie_jaar >= 20) redenen.push(`${o.garantie_jaar} jaar garantie`);
    return redenen.slice(0, 3).join(" · ");
  }

  /* ------------------------------------------------------------------
     Renderen
     ------------------------------------------------------------------ */

  function adviseer() {
    const s = invoer();
    const { doelVerbruik, benodigdWp, extras } = vermogenAdvies(s);

    // Vertaal naar panelen op basis van een gangbaar paneel van ~440 Wp
    const refWp = 440;
    let aantal = Math.max(2, Math.round(benodigdWp / refWp));
    const dakTeKlein = aantal > s.maxPanelen;
    const aantalGeadviseerd = Math.min(aantal, s.maxPanelen);
    const wpGeadviseerd = aantalGeadviseerd * refWp;
    const opbrengst = Math.round(wpGeadviseerd * s.factor);
    const dekking = Math.round((opbrengst / doelVerbruik) * 100);

    const top3 = scorePanelen(s, dakTeKlein);
    const plekken = ["🥇 Beste match", "🥈 Tweede keus", "🥉 Derde keus"];
    const topOmvormers = omvormerAdvies(s);
    // Vuistregel omvormergrootte: circa 90% van het paneelvermogen, afgerond op halve kW
    const omvormerKw = String(Math.max(1.5, Math.round((wpGeadviseerd * 0.9) / 500) / 2)).replace(".", ",");

    el("adviesInhoud").innerHTML = `
      <div class="advies-samenvatting">
        <div class="groot">${aantalGeadviseerd} panelen (circa ${numFmt.format(wpGeadviseerd)} Wp)</div>
        <p style="margin:6px 0 0;">Verwachte opbrengst: <b>${numFmt.format(opbrengst)} kWh per jaar</b>, circa ${dekking}% van je ${extras.length ? "verwachte " : ""}verbruik van ${numFmt.format(doelVerbruik)} kWh.</p>
        ${extras.length ? `<p class="hint" style="margin:6px 0 0;">Meegerekend: ${extras.join(", ")}.</p>` : ""}
        ${s.batterij ? '<p class="hint" style="margin:6px 0 0;">Omdat je een thuisbatterij (verwacht) hebt, adviseren wij circa 15% ruimer: het overschot gebruik je dan zelf.</p>' : ""}
        ${dakTeKlein ? `<p style="margin:8px 0 0;background:var(--kleur-accent-licht);border-radius:8px;padding:8px 12px;font-size:0.92rem;">⚠️ Voor je volledige verbruik zouden circa ${aantal} panelen nodig zijn, meer dan er op je dak passen. Kies daarom een paneel met een hoog rendement; die wegen hieronder automatisch zwaarder.</p>` : ""}
      </div>

      <h2 style="margin-top:20px;">De drie best passende panelen</h2>
      ${top3.map(({ p, per }, i) => `
        <div class="advies-kaart">
          <span class="plek">${plekken[i]}</span>
          <h3><a href="paneel/${encodeURIComponent(p.id)}.html">${escapeHtml(naamVan(p))}</a></h3>
          <div class="reden">${redenVoor(p, s, dakTeKlein)}</div>
          <p style="margin:8px 0 0;font-size:0.95rem;">${p.vermogen_wp} Wp · richtprijs <b>${eurFmt.format(p.richtprijs_eur || 0)}</b> per paneel · ${aantalGeadviseerd} stuks: circa <b>${eurFmt.format((p.richtprijs_eur || 0) * aantalGeadviseerd)}</b> (excl. montage en omvormer)</p>
          <p style="margin:8px 0 0;"><a class="knop knop-secundair" style="padding:8px 14px;font-size:0.88rem;" href="rekenmodule.html?paneel=${encodeURIComponent(p.id)}">Bereken opbrengst en terugverdientijd →</a></p>
        </div>
      `).join("")}
      ${!top3.length ? '<p class="hint">Geen panelen gevonden met deze wensen; zet bijvoorbeeld het full black-filter uit.</p>' : ""}

      ${topOmvormers ? `
      <h2 style="margin-top:24px;">En welke omvormer past daarbij?</h2>
      <p class="hint" style="margin-top:0;">Op basis van je schaduw${s.batterij ? ", batterijplannen" : ""}${s.slim ? " en wens om slim aan te sturen" : ""}. Richt je op een omvormer van circa ${omvormerKw} kW bij ${aantalGeadviseerd} panelen.</p>
      ${topOmvormers.map(({ o }, i) => `
        <div class="advies-kaart">
          <span class="plek">${["⚡ Beste match", "⚡ Ook geschikt"][i]}</span>
          <h3>${escapeHtml(o.merk)} ${escapeHtml(o.model)}</h3>
          <div class="reden">${omvormerReden(o, s)}</div>
          <p style="margin:8px 0 0;font-size:0.95rem;">richtprijs <b>${eurFmt.format(o.richtprijs_eur || 0)}</b> (${escapeHtml(o.prijs_toelichting || "indicatie")})</p>
        </div>
      `).join("")}
      <p class="hint" style="margin-top:10px;">Alle ${omvormers.length} omvormersystemen vergelijken op batterij, Home Assistant en schaduw? <a href="omvormers.html">Naar de omvormer-vergelijker →</a></p>` : ""}

      <p class="hint" style="margin-top:14px;">Alle ${panelen.length} panelen zelf vergelijken? <a href="index.html">Naar de vergelijker →</a></p>
    `;
  }

  async function init() {
    try {
      const res = await fetch("data/panelen.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      panelen = data.panelen || [];

      // Omvormers meladen voor het omvormeradvies (best effort)
      try {
        const resO = await fetch("data/omvormers.json", { cache: "no-cache" });
        if (resO.ok) omvormers = (await resO.json()).omvormers || [];
      } catch { /* zonder omvormerdata blijft het paneeladvies gewoon werken */ }

      ["verbruik", "dakligging", "maxPanelen", "voorkeur", "schaduw"].forEach((id) => {
        el(id).addEventListener("input", adviseer);
        el(id).addEventListener("change", adviseer);
      });
      ["checkAuto", "checkWarmtepomp", "checkBatterij", "checkFullBlack", "checkSlim"].forEach((id) => {
        el(id).addEventListener("change", adviseer);
      });

      adviseer();
    } catch (err) {
      el("adviesInhoud").innerHTML = '<p class="hint">De paneelgegevens konden niet worden geladen. Vernieuw de pagina of probeer het later opnieuw.</p>';
      console.error("Fout bij laden panelen.json:", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
