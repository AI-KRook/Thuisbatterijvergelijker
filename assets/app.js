/* ==========================================================================
   Thuisbatterijvergelijker - vergelijkingslogica
   Laadt data/batterijen.json en rendert kaarten, tabel en vergelijk-modal.
   ========================================================================== */

(function () {
  "use strict";

  const state = {
    batterijen: [],
    meta: {},
    weergave: "kaarten", // of "tabel"
    sortering: "prijs-per-kwh",
    tabelSortKolom: null,
    tabelSortRichting: 1,
    vergelijkSelectie: [],
    filters: {
      type: "alle",
      capaciteit: "alle",
      installatie: "alle",
      merk: "alle",
      homey: false,
      homeAssistant: false,
      dynamisch: false,
      noodstroom: false,
      aanbieding: false,
    },
  };

  const el = (id) => document.getElementById(id);

  const eurFmt = new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

  const datumFmt = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" });

  /* ------------------------------------------------------------------
     Data helpers
     ------------------------------------------------------------------ */

  function bestePrijs(b) {
    const aanbiedingen = (b.aanbiedingen || []).filter((a) => a && a.prijs_eur);
    if (aanbiedingen.length) {
      return aanbiedingen.reduce((min, a) => (a.prijs_eur < min.prijs_eur ? a : min));
    }
    if (b.richtprijs_eur) {
      return { winkel: b.prijs_bron || "richtprijs", prijs_eur: b.richtprijs_eur, url: b.product_url };
    }
    return null;
  }

  function heeftKorting(b) {
    const beste = bestePrijs(b);
    return !!(beste && b.richtprijs_eur && beste.prijs_eur < b.richtprijs_eur * 0.97);
  }

  function prijsPerKwh(b) {
    const beste = bestePrijs(b);
    if (!beste || !b.capaciteit_kwh) return null;
    return Math.round(beste.prijs_eur / b.capaciteit_kwh);
  }

  function totaalprijsTekst(b) {
    if (!b.totaalprijs_van_eur) return null;
    return eurFmt.format(b.totaalprijs_van_eur) + (b.totaalprijs_tot_eur ? " tot " + eurFmt.format(b.totaalprijs_tot_eur) : "");
  }

  // true / "tekst" => ondersteund (evt. met kanttekening); false/null => niet
  function driewaardig(v) {
    if (v === true) return { status: "ja", tekst: "Ja" };
    if (typeof v === "string" && v.trim()) return { status: "deels", tekst: v };
    return { status: "nee", tekst: "Nee" };
  }

  // Zoals driewaardig, maar met expliciet "onbekend" voor ontbrekende data
  function vierwaardig(v) {
    if (v === undefined || v === null) return { status: "onbekend", tekst: "Onbekend" };
    return driewaardig(v);
  }

  /* ------------------------------------------------------------------
     Filteren en sorteren
     ------------------------------------------------------------------ */

  function capaciteitInBereik(kwh, bereik) {
    switch (bereik) {
      case "klein": return kwh < 4;
      case "middel": return kwh >= 4 && kwh <= 10;
      case "groot": return kwh > 10;
      default: return true;
    }
  }

  function gefilterd() {
    const f = state.filters;
    return state.batterijen.filter((b) => {
      if (f.type !== "alle" && b.type !== f.type) return false;
      if (f.merk !== "alle" && b.merk !== f.merk) return false;
      if (!capaciteitInBereik(b.capaciteit_kwh || 0, f.capaciteit)) return false;
      if (f.installatie === "zelf" && b.installatie !== "zelf") return false;
      if (f.installatie === "installateur" && b.installatie !== "installateur") return false;
      if (f.homey && driewaardig(b.homey).status === "nee") return false;
      if (f.homeAssistant && driewaardig(b.home_assistant).status === "nee") return false;
      if (f.dynamisch && driewaardig(b.dynamisch_contract).status === "nee") return false;
      if (f.noodstroom && !["ja", "deels"].includes(vierwaardig(b.noodstroom).status)) return false;
      if (f.aanbieding && !heeftKorting(b)) return false;
      return true;
    });
  }

  function gesorteerd(lijst) {
    const kopie = [...lijst];
    const prijsVan = (b) => { const p = bestePrijs(b); return p ? p.prijs_eur : Infinity; };
    switch (state.sortering) {
      case "prijs-oplopend": kopie.sort((a, b) => prijsVan(a) - prijsVan(b)); break;
      case "totaalprijs": kopie.sort((a, b) => (a.totaalprijs_van_eur || Infinity) - (b.totaalprijs_van_eur || Infinity)); break;
      case "prijs-aflopend": kopie.sort((a, b) => prijsVan(b) - prijsVan(a)); break;
      case "prijs-per-kwh": kopie.sort((a, b) => (prijsPerKwh(a) || Infinity) - (prijsPerKwh(b) || Infinity)); break;
      case "capaciteit": kopie.sort((a, b) => (b.capaciteit_kwh || 0) - (a.capaciteit_kwh || 0)); break;
      case "koppelgemak": kopie.sort((a, b) => (b.koppeling_gemak || 0) - (a.koppeling_gemak || 0)); break;
      case "slim-score": kopie.sort((a, b) => slimScore(b) - slimScore(a) || (prijsPerKwh(a) || Infinity) - (prijsPerKwh(b) || Infinity)); break;
    }
    return kopie;
  }

  /* ------------------------------------------------------------------
     Rendering: kaarten
     ------------------------------------------------------------------ */

  // Merklogo: toont het officiële logo naast de merknaam zodra het bestand in
  // assets/logos/ staat en is geregistreerd in data/batterijen.json (merk_logos).
  function merkHtml(b) {
    const logo = (state.meta.merk_logos || {})[b.merk];
    return logo
      ? `<img class="merk-logo" src="${escapeHtml(logo)}" alt="" loading="lazy"> ${escapeHtml(b.merk)}`
      : escapeHtml(b.merk);
  }

  // Slim-score: unieke Batterijmaatje-score voor slim aansturen (0 tot 6 punten).
  // Homey, Home Assistant en dynamisch contract tellen elk: ja = 2, deels = 1, nee = 0.
  // De formule staat uitgelegd op uitleg.html#slim-score en over-ons.html.
  function slimScore(b) {
    const punt = (v) => { const s = driewaardig(v).status; return s === "ja" ? 2 : s === "deels" ? 1 : 0; };
    return punt(b.homey) + punt(b.home_assistant) + punt(b.dynamisch_contract);
  }

  function slimScoreBadge(b) {
    const score = slimScore(b);
    const klasse = score >= 5 ? "slim-hoog" : score >= 3 ? "slim-midden" : "slim-laag";
    return `<span class="badge slim-score ${klasse}" title="Slim-score ${score} van 6: punten voor samenwerking met Homey, Home Assistant en een dynamisch energiecontract (2 punten per volledige, 1 per gedeeltelijke ondersteuning). Tik voor de details.">🏠 Slim-score ${score}/6</span>`;
  }

  function badgeHtml(label, waarde, titelJa, titelDeels) {
    const d = driewaardig(waarde);
    const icoon = d.status === "ja" ? "✓" : d.status === "deels" ? "~" : "✕";
    const titel = d.status === "deels" ? d.tekst : d.status === "ja" ? (titelJa || "Ondersteund") : "Niet ondersteund";
    return `<span class="badge ${d.status}" title="${escapeHtml(titel)}">${icoon} ${escapeHtml(label)}</span>`;
  }

  function noodstroomBadge(b) {
    const d = vierwaardig(b.noodstroom);
    const icoon = { ja: "✓", deels: "~", nee: "✕", onbekend: "?" }[d.status];
    return `<span class="badge ${d.status}" title="${escapeHtml(b.noodstroom_uitleg || d.tekst)}">${icoon} Noodstroom</span>`;
  }

  function sterren(score) {
    const s = Math.max(0, Math.min(5, Math.round(score || 0)));
    return "★".repeat(s) + "☆".repeat(5 - s);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function kaartHtml(b) {
    const beste = bestePrijs(b);
    const korting = heeftKorting(b);
    const perKwh = prijsPerKwh(b);
    const typeLabel = { "plug-in": "Plug-in (stopcontact)", "ac-gekoppeld": "AC-gekoppeld", "hybride": "Hybride omvormer" }[b.type] || b.type;
    const geselecteerd = state.vergelijkSelectie.includes(b.id);

    const capaciteit = b.capaciteit_kwh
      ? `${String(b.capaciteit_kwh).replace(".", ",")} kWh${b.uitbreidbaar_tot_kwh ? ` <small>(tot ${String(b.uitbreidbaar_tot_kwh).replace(".", ",")})</small>` : ""}`
      : "Onbekend";

    return `
    <article class="batterij-kaart" data-id="${escapeHtml(b.id)}">
      <div class="vergelijk-checkbox-wrap">
        <label class="badge" title="Selecteer om te vergelijken (max. 3)">
          <input type="checkbox" class="vergelijk-check" data-id="${escapeHtml(b.id)}" ${geselecteerd ? "checked" : ""}> vergelijk
        </label>
      </div>
      <div class="kaart-kop">
        <div>
          <div class="merk">${merkHtml(b)}</div>
          <h3><a href="batterij/${encodeURIComponent(b.id)}.html" style="color:inherit;text-decoration:none;" title="Alle details van de ${escapeHtml(b.merk)} ${escapeHtml(b.model)}">${escapeHtml(b.model)}</a></h3>
          <a class="term-link" href="uitleg.html#${escapeHtml(b.type)}" title="Wat betekent dit? Lees de uitleg in de woordenlijst"><span class="type-badge type-${escapeHtml(b.type)}">${escapeHtml(typeLabel)}</span></a>
        </div>
        ${korting ? '<span class="aanbieding-vlag">Aanbieding</span>' : ""}
      </div>
      <div class="kaart-specs">
        <div class="spec"><span class="spec-label"><a class="term-link" href="uitleg.html#capaciteit" title="Wat is capaciteit (kWh)? Lees de uitleg">Capaciteit</a></span><span class="spec-waarde">${capaciteit}</span></div>
        <div class="spec"><span class="spec-label"><a class="term-link" href="uitleg.html#kw" title="Wat is vermogen (kW)? Lees de uitleg">Vermogen</a></span><span class="spec-waarde">${b.vermogen_kw ? String(b.vermogen_kw).replace(".", ",") + " kW" : "Onbekend"}</span></div>
        <div class="spec"><span class="spec-label">Installatie</span><span class="spec-waarde">${b.installatie === "zelf" ? "Zelf (stopcontact)" : "Installateur"}</span></div>
        <div class="spec"><span class="spec-label">Garantie</span><span class="spec-waarde">${b.garantie_jaar ? b.garantie_jaar + " jaar" : "Onbekend"}</span></div>
      </div>
      <div class="koppelgemak" title="Hoe makkelijk koppel je deze batterij aan een bestaand zonnepanelensysteem? 5 sterren = plug &amp; play.">
        <span class="spec-label" style="font-size:0.75rem;color:var(--kleur-tekst-licht);font-weight:600;text-transform:uppercase;">Koppeling met je zonnepanelen</span><br>
        <span class="sterren">${sterren(b.koppeling_gemak)}</span>
        <div class="uitleg">${escapeHtml(b.zonnepanelen_koppeling || "")}</div>
      </div>
      <div class="kaart-badges">
        ${slimScoreBadge(b)}
        ${badgeHtml("Homey", b.homey)}
        ${badgeHtml("Home Assistant", b.home_assistant)}
        ${badgeHtml("Dynamisch contract", b.dynamisch_contract)}
        ${noodstroomBadge(b)}
      </div>
      <button class="details-toggle" data-id="${escapeHtml(b.id)}">Meer details</button>
      <div class="kaart-details" data-details="${escapeHtml(b.id)}" hidden>
        <dt>Homey</dt><dd>${escapeHtml(driewaardig(b.homey).tekst)}</dd>
        <dt>Home Assistant</dt><dd>${escapeHtml(driewaardig(b.home_assistant).tekst)}</dd>
        <dt>Dynamisch contract</dt><dd>${escapeHtml(driewaardig(b.dynamisch_contract).tekst)}</dd>
        <dt>Noodstroom bij stroomuitval</dt><dd>${escapeHtml(b.noodstroom_uitleg || vierwaardig(b.noodstroom).tekst)}</dd>
        ${b.opmerkingen ? `<dt>Goed om te weten</dt><dd>${escapeHtml(b.opmerkingen)}</dd>` : ""}
        ${b.cycli ? `<dt>Laadcycli (garantie)</dt><dd>${escapeHtml(String(b.cycli))}</dd>` : ""}
        ${b.fase ? `<dt>Aansluiting</dt><dd>${escapeHtml(b.fase)}</dd>` : ""}
        ${b.app ? `<dt>App</dt><dd>${escapeHtml(b.app)}</dd>` : ""}
        ${(b.aanbiedingen || []).length ? `<dt>Verkrijgbaar bij</dt><dd><ul class="winkel-lijst">${b.aanbiedingen.map((a) => `<li><span>${escapeHtml(a.winkel)}</span><span><b>${eurFmt.format(a.prijs_eur)}</b> &nbsp;<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener sponsored">bekijk</a></span></li>`).join("")}</ul></dd>` : ""}
        ${b.product_url ? `<dt>Fabrikant</dt><dd><a href="${escapeHtml(b.product_url)}" target="_blank" rel="noopener">officiële productpagina</a></dd>` : ""}
        ${b.prijs_datum ? `<dd class="datum-stempel" style="margin-top:8px;">Prijs gecontroleerd: ${escapeHtml(b.prijs_datum)}</dd>` : ""}
      </div>
      <div class="kaart-prijs">
        <div class="prijs-blok">
          ${korting ? `<div class="van-prijs">${eurFmt.format(b.richtprijs_eur)}</div>` : ""}
          <div class="prijs">${beste ? eurFmt.format(beste.prijs_eur) : "Prijs op aanvraag"}</div>
          ${perKwh ? `<div class="prijs-per-kwh">${eurFmt.format(perKwh)} per kWh opslag</div>` : ""}
          ${beste && beste.winkel ? `<div class="prijs-winkel">bij ${escapeHtml(beste.winkel)}</div>` : ""}
          ${b.prijs_omvat ? `<div class="prijs-winkel">${escapeHtml(b.prijs_omvat)}</div>` : ""}
          <div class="prijs-winkel" style="margin-top:6px;border-top:1px dashed var(--kleur-rand);padding-top:6px;" title="${escapeHtml(b.totaalprijs_toelichting || "")}">
            ${beste && b.totaalprijs_van_eur === beste.prijs_eur && !b.totaalprijs_tot_eur
              ? "✓ Dit is de complete prijs, gebruiksklaar"
              : `Compleet gebruiksklaar (indicatie): <b>${totaalprijsTekst(b) || "op aanvraag"}</b>`}
          </div>
        </div>
      </div>
      <div class="kaart-acties">
        ${beste && beste.url ? `<a class="knop" href="${escapeHtml(beste.url)}" target="_blank" rel="noopener sponsored">Bekijk aanbieding →</a>` : (b.product_url ? `<a class="knop" href="${escapeHtml(b.product_url)}" target="_blank" rel="noopener">Naar aanbieder →</a>` : "")}
        <a class="knop knop-secundair" href="rekenmodule.html?batterij=${encodeURIComponent(b.id)}" title="Bereken de terugverdientijd van deze batterij voor jouw situatie">Terugverdientijd</a>
      </div>
    </article>`;
  }

  /* ------------------------------------------------------------------
     Rendering: tabel
     ------------------------------------------------------------------ */

  const tabelKolommen = [
    { key: "model", label: "Model", get: (b) => `${b.merk} ${b.model}` },
    { key: "capaciteit", label: "kWh", get: (b) => b.capaciteit_kwh || 0 },
    { key: "vermogen", label: "kW", get: (b) => b.vermogen_kw || 0 },
    { key: "type", label: "Type", get: (b) => b.type },
    { key: "prijs", label: "Winkelprijs", get: (b) => { const p = bestePrijs(b); return p ? p.prijs_eur : Infinity; } },
    { key: "totaal", label: "Totaal (indicatie)", get: (b) => b.totaalprijs_van_eur || Infinity },
    { key: "perkwh", label: "€/kWh", get: (b) => prijsPerKwh(b) || Infinity },
    { key: "koppeling", label: "PV-koppeling", get: (b) => b.koppeling_gemak || 0 },
    { key: "slim", label: "Slim-score", get: (b) => slimScore(b) },
    { key: "homey", label: "Homey", get: (b) => driewaardig(b.homey).status },
    { key: "ha", label: "Home Assistant", get: (b) => driewaardig(b.home_assistant).status },
    { key: "actie", label: "", get: () => "" },
  ];

  function tabelHtml(lijst) {
    let rijen = [...lijst];
    if (state.tabelSortKolom) {
      const kol = tabelKolommen.find((k) => k.key === state.tabelSortKolom);
      rijen.sort((a, b) => {
        const va = kol.get(a), vb = kol.get(b);
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * state.tabelSortRichting;
        return String(va).localeCompare(String(vb), "nl") * state.tabelSortRichting;
      });
    }
    const checkCel = (v) => {
      const d = driewaardig(v);
      if (d.status === "ja") return '<span class="check-ja">✓</span>';
      if (d.status === "deels") return `<span class="check-deels" title="${escapeHtml(d.tekst)}">~</span>`;
      return '<span class="check-nee">✕</span>';
    };
    return `
    <table class="vergelijk-tabel">
      <thead><tr>${tabelKolommen.map((k) => `<th data-kolom="${k.key}">${k.label}${k.key !== "actie" ? ' <span class="sorteer-pijl">⇅</span>' : ""}</th>`).join("")}</tr></thead>
      <tbody>
        ${rijen.map((b) => {
          const beste = bestePrijs(b);
          const perKwh = prijsPerKwh(b);
          return `<tr>
            <td><b>${merkHtml(b)}</b><br><a href="batterij/${encodeURIComponent(b.id)}.html">${escapeHtml(b.model)}</a></td>
            <td>${b.capaciteit_kwh ? String(b.capaciteit_kwh).replace(".", ",") : "?"}</td>
            <td>${b.vermogen_kw ? String(b.vermogen_kw).replace(".", ",") : "?"}</td>
            <td>${escapeHtml(b.type)}</td>
            <td class="tabel-prijs" title="${escapeHtml(b.prijs_omvat || "")}">${beste ? eurFmt.format(beste.prijs_eur) : "n.b."}${heeftKorting(b) ? ' <span class="aanbieding-vlag">deal</span>' : ""}</td>
            <td title="${escapeHtml(b.totaalprijs_toelichting || "")}">${totaalprijsTekst(b) || "op aanvraag"}</td>
            <td>${perKwh ? eurFmt.format(perKwh) : "n.b."}</td>
            <td title="${escapeHtml(b.zonnepanelen_koppeling || "")}"><span class="sterren" style="color:var(--kleur-accent)">${sterren(b.koppeling_gemak)}</span></td>
            <td title="Punten voor Homey, Home Assistant en dynamisch contract"><b>${slimScore(b)}/6</b></td>
            <td>${checkCel(b.homey)}</td>
            <td>${checkCel(b.home_assistant)}</td>
            <td>${beste && beste.url ? `<a class="knop" style="padding:7px 12px;font-size:0.85rem;" href="${escapeHtml(beste.url)}" target="_blank" rel="noopener sponsored">Bekijk →</a>` : ""}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  }

  /* ------------------------------------------------------------------
     Rendering: vergelijk-modal
     ------------------------------------------------------------------ */

  function vergelijkModalHtml(items) {
    const rij = (label, fn) => `<tr><th style="text-align:left;padding:8px 10px;background:var(--kleur-achtergrond);white-space:nowrap;">${label}</th>${items.map((b) => `<td style="padding:8px 10px;border-bottom:1px solid var(--kleur-rand);">${fn(b)}</td>`).join("")}</tr>`;
    const d3 = (v) => { const d = driewaardig(v); return d.status === "nee" ? "✕ Nee" : d.status === "deels" ? `~ ${escapeHtml(d.tekst)}` : `✓ ${escapeHtml(d.tekst)}`; };
    return `
      <h2>Vergelijking</h2>
      <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:0.93rem;min-width:${220 * items.length + 160}px;">
        ${rij("Model", (b) => `<b>${escapeHtml(b.merk)} ${escapeHtml(b.model)}</b>`)}
        ${rij("Type", (b) => escapeHtml(b.type))}
        ${rij("Capaciteit", (b) => (b.capaciteit_kwh ? String(b.capaciteit_kwh).replace(".", ",") + " kWh" : "?") + (b.uitbreidbaar_tot_kwh ? ` (uitbreidbaar tot ${String(b.uitbreidbaar_tot_kwh).replace(".", ",")} kWh)` : ""))}
        ${rij("Vermogen", (b) => (b.vermogen_kw ? String(b.vermogen_kw).replace(".", ",") + " kW" : "?"))}
        ${rij("Beste winkelprijs", (b) => { const p = bestePrijs(b); return p ? `<b>${eurFmt.format(p.prijs_eur)}</b> bij ${escapeHtml(p.winkel || "")}` : "n.b."; })}
        ${rij("Compleet gebruiksklaar (indicatie)", (b) => `${totaalprijsTekst(b) || "op aanvraag"}<br><small>${escapeHtml(b.totaalprijs_toelichting || "")}</small>`)}
        ${rij("Prijs per kWh", (b) => { const p = prijsPerKwh(b); return p ? eurFmt.format(p) : "n.b."; })}
        ${rij("Prijs dekt", (b) => `<small>${escapeHtml(b.prijs_omvat || "")}</small>`)}
        ${rij("Installatie", (b) => (b.installatie === "zelf" ? "Zelf (stopcontact)" : "Installateur vereist"))}
        ${rij("Koppeling zonnepanelen", (b) => `<span class="sterren" style="color:var(--kleur-accent)">${sterren(b.koppeling_gemak)}</span><br><small>${escapeHtml(b.zonnepanelen_koppeling || "")}</small>`)}
        ${rij("Slim-score", (b) => `<b>${slimScore(b)}/6</b>`)}
        ${rij("Homey", (b) => d3(b.homey))}
        ${rij("Home Assistant", (b) => d3(b.home_assistant))}
        ${rij("Dynamisch contract", (b) => d3(b.dynamisch_contract))}
        ${rij("Garantie", (b) => (b.garantie_jaar ? b.garantie_jaar + " jaar" : "?"))}
        ${rij("", (b) => { const p = bestePrijs(b); return p && p.url ? `<a class="knop" href="${escapeHtml(p.url)}" target="_blank" rel="noopener sponsored">Bekijk aanbieding →</a>` : ""; })}
      </table>
      </div>`;
  }

  /* ------------------------------------------------------------------
     Hoofd-render
     ------------------------------------------------------------------ */

  function render() {
    const lijst = gesorteerd(gefilterd());
    el("resultatenTelling").textContent = `${lijst.length} van ${state.batterijen.length} thuisbatterijen`;

    const doel = el("resultaten");
    if (!lijst.length) {
      doel.innerHTML = '<div class="leeg-melding">Geen batterijen gevonden met deze filters. Probeer een filter uit te zetten.</div>';
    } else if (state.weergave === "kaarten") {
      doel.innerHTML = `<div class="kaarten-grid">${lijst.map(kaartHtml).join("")}</div>`;
    } else {
      doel.innerHTML = `<div class="tabel-wrap">${tabelHtml(lijst)}</div>`;
    }

    // Vergelijk-balk
    const balk = el("vergelijkBalk");
    if (state.vergelijkSelectie.length >= 2) {
      balk.classList.add("zichtbaar");
      el("vergelijkBalkTekst").textContent = `${state.vergelijkSelectie.length} batterijen geselecteerd`;
    } else {
      balk.classList.remove("zichtbaar");
    }
  }

  /* ------------------------------------------------------------------
     Events
     ------------------------------------------------------------------ */

  function koppelEvents() {
    ["filterType", "filterCapaciteit", "filterInstallatie", "filterMerk"].forEach((id) => {
      el(id).addEventListener("change", (e) => {
        const map = { filterType: "type", filterCapaciteit: "capaciteit", filterInstallatie: "installatie", filterMerk: "merk" };
        state.filters[map[id]] = e.target.value;
        render();
      });
    });

    [["checkHomey", "homey"], ["checkHA", "homeAssistant"], ["checkDynamisch", "dynamisch"], ["checkNoodstroom", "noodstroom"], ["checkAanbieding", "aanbieding"]].forEach(([id, key]) => {
      el(id).addEventListener("change", (e) => { state.filters[key] = e.target.checked; render(); });
    });

    el("sorteer").addEventListener("change", (e) => { state.sortering = e.target.value; render(); });

    // Mobiel: filters in- en uitklappen
    const filterToggle = el("filterToggle");
    if (filterToggle) {
      filterToggle.addEventListener("click", () => {
        const balk = el("filterbalk");
        const ingeklapt = balk.classList.toggle("ingeklapt");
        filterToggle.textContent = ingeklapt ? "🔍 Filteren en sorteren ▾" : "🔍 Filteren en sorteren ▴";
      });
    }

    el("resetFilters").addEventListener("click", () => {
      state.filters = { type: "alle", capaciteit: "alle", installatie: "alle", merk: "alle", homey: false, homeAssistant: false, dynamisch: false, noodstroom: false, aanbieding: false };
      el("filterType").value = "alle"; el("filterCapaciteit").value = "alle";
      el("filterInstallatie").value = "alle"; el("filterMerk").value = "alle";
      ["checkHomey", "checkHA", "checkDynamisch", "checkNoodstroom", "checkAanbieding"].forEach((id) => { el(id).checked = false; });
      render();
    });

    el("knopKaarten").addEventListener("click", () => { state.weergave = "kaarten"; el("knopKaarten").classList.add("actief"); el("knopTabel").classList.remove("actief"); render(); });
    el("knopTabel").addEventListener("click", () => { state.weergave = "tabel"; el("knopTabel").classList.add("actief"); el("knopKaarten").classList.remove("actief"); render(); });

    // Gedelegeerde events voor dynamische content
    el("resultaten").addEventListener("click", (e) => {
      // Tik op een info-badge (zoals "~ Home Assistant") opent de details met uitleg
      const badge = e.target.closest(".kaart-badges .badge");
      if (badge) {
        const kaart = badge.closest(".batterij-kaart");
        const details = kaart && kaart.querySelector(".kaart-details");
        const knop = kaart && kaart.querySelector(".details-toggle");
        if (details && details.hidden) {
          details.hidden = false;
          if (knop) knop.textContent = "Verberg details";
        }
        return;
      }
      const toggle = e.target.closest(".details-toggle");
      if (toggle) {
        const details = document.querySelector(`[data-details="${toggle.dataset.id}"]`);
        if (details) {
          details.hidden = !details.hidden;
          toggle.textContent = details.hidden ? "Meer details" : "Verberg details";
        }
        return;
      }
      const th = e.target.closest("th[data-kolom]");
      if (th && th.dataset.kolom !== "actie") {
        if (state.tabelSortKolom === th.dataset.kolom) state.tabelSortRichting *= -1;
        else { state.tabelSortKolom = th.dataset.kolom; state.tabelSortRichting = 1; }
        render();
      }
    });

    el("resultaten").addEventListener("change", (e) => {
      const check = e.target.closest(".vergelijk-check");
      if (!check) return;
      const id = check.dataset.id;
      if (check.checked) {
        if (state.vergelijkSelectie.length >= 3) {
          check.checked = false;
          alert("Je kunt maximaal 3 batterijen tegelijk vergelijken.");
          return;
        }
        state.vergelijkSelectie.push(id);
      } else {
        state.vergelijkSelectie = state.vergelijkSelectie.filter((x) => x !== id);
      }
      render();
    });

    el("openVergelijk").addEventListener("click", () => {
      const items = state.batterijen.filter((b) => state.vergelijkSelectie.includes(b.id));
      el("vergelijkModalInhoud").innerHTML = vergelijkModalHtml(items);
      el("vergelijkModal").classList.add("open");
    });

    el("wisVergelijk").addEventListener("click", () => { state.vergelijkSelectie = []; render(); });
    el("sluitModal").addEventListener("click", () => el("vergelijkModal").classList.remove("open"));
    el("vergelijkModal").addEventListener("click", (e) => { if (e.target === el("vergelijkModal")) el("vergelijkModal").classList.remove("open"); });
  }

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */

  async function init() {
    try {
      const res = await fetch("data/batterijen.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.batterijen = data.batterijen || [];
      state.meta = data;

      if (data.laatst_bijgewerkt) {
        const d = new Date(data.laatst_bijgewerkt + "T12:00:00");
        el("updateDatum").textContent = datumFmt.format(d);
      }

      // Merkenfilter vullen
      const merken = [...new Set(state.batterijen.map((b) => b.merk))].sort((a, b) => a.localeCompare(b, "nl"));
      el("filterMerk").innerHTML = '<option value="alle">Alle merken</option>' + merken.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

      koppelEvents();
      render();
    } catch (err) {
      el("resultaten").innerHTML = '<div class="leeg-melding">De batterijgegevens konden niet worden geladen. Vernieuw de pagina of probeer het later opnieuw.</div>';
      console.error("Fout bij laden batterijen.json:", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
