/* ==========================================================================
   Zonnepaneelmaatje - omvormer-vergelijker
   Laadt data/omvormers.json en rendert kaarten met de Koppel-score:
   batterij-klaar, slim uitlezen (Home Assistant/Modbus) en schaduwaanpak.
   ========================================================================== */

(function () {
  "use strict";

  const state = {
    omvormers: [],
    sortering: "koppel-score",
    filters: { type: "alle", fase: "alle", merk: "alle", batterij: false, officieelHa: false },
  };

  const el = (id) => document.getElementById(id);

  const eurFmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const datumFmt = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" });

  const TYPE_LABEL = {
    "micro": "Micro-omvormers",
    "optimizer": "Optimizers",
    "hybride": "Hybride",
    "string": "String",
  };

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  // {status, tekst} => genormaliseerd; status is "ja", "deels" of "nee"
  function driewaardig(v) {
    if (v && typeof v === "object") return { status: v.status || "deels", tekst: v.tekst || "" };
    if (v === true) return { status: "ja", tekst: "Ja" };
    if (typeof v === "string" && v.trim()) return { status: "deels", tekst: v };
    return { status: "nee", tekst: "Nee" };
  }

  // Koppel-score: unieke Zonnepaneelmaatje-score (0 tot 6) voor hoe goed een
  // omvormer te koppelen is. Drie zaken tellen mee, elk 0-2 punten:
  //  - thuisbatterij: direct aan te sluiten (hybride/eigen lijn) = 2, via omweg = 1
  //  - slim uitlezen/aansturen: officiële integratie of open lokale API = 2,
  //    community-integratie of cloud-omweg = 1
  //  - schaduwaanpak: elektronica per paneel = 2, meerdere MPPT's = 1
  function koppelScore(o) {
    const punt = (v) => { const s = driewaardig(v).status; return s === "ja" ? 2 : s === "deels" ? 1 : 0; };
    return punt(o.batterij) + punt(o.home_assistant) + punt(o.schaduw);
  }

  function koppelScoreBadge(o) {
    const score = koppelScore(o);
    const klasse = score >= 5 ? "zeker-hoog" : score >= 3 ? "zeker-midden" : "zeker-laag";
    return `<span class="badge zeker-score ${klasse}" title="Koppel-score ${score} van 6: punten voor batterij-klaar, slim uitlezen (Home Assistant/Modbus) en schaduwaanpak (2 punten per onderdeel). Tik voor de details.">🔗 Koppel-score ${score}/6</span>`;
  }

  function badgeHtml(label, waarde) {
    const d = driewaardig(waarde);
    const icoon = d.status === "ja" ? "✓" : d.status === "deels" ? "~" : "✕";
    return `<span class="badge ${d.status}" data-uitleg="${escapeHtml(label)}" title="${escapeHtml(d.tekst)}">${icoon} ${escapeHtml(label)}</span>`;
  }

  function gefilterd() {
    const f = state.filters;
    return state.omvormers.filter((o) => {
      if (f.type !== "alle" && o.type !== f.type) return false;
      if (f.merk !== "alle" && o.merk !== f.merk) return false;
      if (f.fase === "1" && !/1-fase/i.test(o.fase || "")) return false;
      if (f.fase === "3" && !/3-fase/i.test(o.fase || "")) return false;
      if (f.batterij && driewaardig(o.batterij).status !== "ja") return false;
      if (f.officieelHa && driewaardig(o.home_assistant).status !== "ja") return false;
      return true;
    });
  }

  function gesorteerd(lijst) {
    const kopie = [...lijst];
    switch (state.sortering) {
      case "prijs-oplopend": kopie.sort((a, b) => (a.richtprijs_eur || Infinity) - (b.richtprijs_eur || Infinity)); break;
      case "prijs-aflopend": kopie.sort((a, b) => (b.richtprijs_eur || 0) - (a.richtprijs_eur || 0)); break;
      case "garantie": kopie.sort((a, b) => (b.garantie_jaar || 0) - (a.garantie_jaar || 0)); break;
      case "koppel-score": kopie.sort((a, b) => koppelScore(b) - koppelScore(a) || (a.richtprijs_eur || Infinity) - (b.richtprijs_eur || Infinity)); break;
    }
    return kopie;
  }

  function kaartHtml(o) {
    const batterij = driewaardig(o.batterij);
    const ha = driewaardig(o.home_assistant);
    const schaduw = driewaardig(o.schaduw);
    return `
    <article class="paneel-kaart" data-id="${escapeHtml(o.id)}">
      <div class="kaart-kop">
        <div>
          <div class="merk">${escapeHtml(o.merk)}</div>
          <h3>${escapeHtml(o.model)}</h3>
          <span class="type-badge type-omv-${escapeHtml(o.type)}">${escapeHtml(TYPE_LABEL[o.type] || o.type)}</span>
        </div>
      </div>
      <div class="kaart-specs">
        <div class="spec"><span class="spec-label">Vermogen</span><span class="spec-waarde">${escapeHtml(o.vermogen_bereik || "?")}</span></div>
        <div class="spec"><span class="spec-label">Aansluiting</span><span class="spec-waarde">${escapeHtml(o.fase || "?")}</span></div>
        <div class="spec"><span class="spec-label">Garantie</span><span class="spec-waarde">${o.garantie_jaar ? o.garantie_jaar + " jaar" : "Onbekend"}</span></div>
        <div class="spec"><span class="spec-label">App</span><span class="spec-waarde">${escapeHtml(o.app || "?")}</span></div>
      </div>
      <div class="kaart-badges">
        ${koppelScoreBadge(o)}
        ${badgeHtml("Thuisbatterij", o.batterij)}
        ${badgeHtml("Home Assistant", o.home_assistant)}
        ${badgeHtml("Schaduwaanpak", o.schaduw)}
      </div>
      <button class="details-toggle" data-id="${escapeHtml(o.id)}">Meer details</button>
      <div class="kaart-details" data-details="${escapeHtml(o.id)}" hidden>
        <dt>Thuisbatterij</dt><dd>${escapeHtml(batterij.tekst)}</dd>
        <dt>Home Assistant / slim uitlezen</dt><dd>${escapeHtml(ha.tekst)}</dd>
        <dt>Schaduwaanpak</dt><dd>${escapeHtml(schaduw.tekst)}</dd>
        ${o.opmerkingen ? `<dt>Goed om te weten</dt><dd>${escapeHtml(o.opmerkingen)}</dd>` : ""}
        ${o.product_url ? `<dt>Fabrikant</dt><dd><a href="${escapeHtml(o.product_url)}" target="_blank" rel="noopener">officiële website van ${escapeHtml(o.merk)}</a></dd>` : ""}
      </div>
      <div class="kaart-prijs">
        <div class="prijs-blok">
          <div class="prijs">${o.richtprijs_eur ? eurFmt.format(o.richtprijs_eur) : "Prijs op aanvraag"}</div>
          ${o.voorbeeld_variant ? `<div class="prijs-per-kwh">richtprijs voor: ${escapeHtml(o.voorbeeld_variant)}</div>` : ""}
          ${o.prijs_toelichting ? `<div class="prijs-winkel">${escapeHtml(o.prijs_toelichting)}</div>` : ""}
        </div>
      </div>
    </article>`;
  }

  function render() {
    const lijst = gesorteerd(gefilterd());
    el("resultatenTelling").textContent = `${lijst.length} van ${state.omvormers.length} omvormersystemen`;
    el("resultaten").innerHTML = lijst.length
      ? `<div class="kaarten-grid">${lijst.map(kaartHtml).join("")}</div>`
      : '<div class="leeg-melding">Geen omvormers gevonden met deze filters. Probeer een filter uit te zetten.</div>';
  }

  function koppelEvents() {
    [["filterType", "type"], ["filterFase", "fase"], ["filterMerk", "merk"]].forEach(([id, key]) => {
      el(id).addEventListener("change", (e) => { state.filters[key] = e.target.value; render(); });
    });
    [["checkBatterij", "batterij"], ["checkHa", "officieelHa"]].forEach(([id, key]) => {
      el(id).addEventListener("change", (e) => { state.filters[key] = e.target.checked; render(); });
    });
    el("sorteer").addEventListener("change", (e) => { state.sortering = e.target.value; render(); });

    // Details en badge-tik: zelfde gedrag als de panelenvergelijker
    el("resultaten").addEventListener("click", (e) => {
      const badge = e.target.closest(".kaart-badges .badge");
      if (badge) {
        const kaart = badge.closest(".paneel-kaart");
        const details = kaart && kaart.querySelector(".kaart-details");
        const knop = kaart && kaart.querySelector(".details-toggle");
        if (!details) return;
        if (details.hidden) { details.hidden = false; if (knop) knop.textContent = "Verberg details"; }
        const label = badge.dataset.uitleg || "";
        let doel = null;
        details.querySelectorAll("dt").forEach((dt) => {
          if (!doel && label && dt.textContent.trim().startsWith(label)) doel = dt;
        });
        details.querySelectorAll(".uitgelicht").forEach((n) => n.classList.remove("uitgelicht"));
        const uitgelicht = doel ? [doel, doel.nextElementSibling] : [details];
        uitgelicht.forEach((n) => { if (n) { void n.offsetWidth; n.classList.add("uitgelicht"); } });
        (doel || details).scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const toggle = e.target.closest(".details-toggle");
      if (toggle) {
        const details = document.querySelector(`[data-details="${toggle.dataset.id}"]`);
        if (details) {
          details.hidden = !details.hidden;
          toggle.textContent = details.hidden ? "Meer details" : "Verberg details";
        }
      }
    });
  }

  async function init() {
    try {
      const res = await fetch("data/omvormers.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.omvormers = data.omvormers || [];

      if (data.laatst_bijgewerkt) {
        const d = new Date(data.laatst_bijgewerkt + "T12:00:00");
        const doel = el("updateDatum");
        if (doel) doel.textContent = datumFmt.format(d);
      }

      const merken = [...new Set(state.omvormers.map((o) => o.merk))].sort((a, b) => a.localeCompare(b, "nl"));
      el("filterMerk").innerHTML = '<option value="alle">Alle merken</option>' + merken.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

      koppelEvents();
      render();
    } catch (err) {
      el("resultaten").innerHTML = '<div class="leeg-melding">De omvormergegevens konden niet worden geladen. Vernieuw de pagina of probeer het later opnieuw.</div>';
      console.error("Fout bij laden omvormers.json:", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
