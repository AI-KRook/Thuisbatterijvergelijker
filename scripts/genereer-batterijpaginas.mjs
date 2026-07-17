#!/usr/bin/env node
/**
 * Genereert statische detailpagina's per batterij in /batterij/<id>.html
 * op basis van data/batterijen.json, en herbouwt sitemap.xml.
 *
 * Wordt lokaal gedraaid bij wijzigingen en dagelijks door de
 * prijsupdate-workflow, zodat prijzen op de pagina's actueel blijven.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SITE = "https://batterijmaatje.nl";
const VANDAAG = new Date().toISOString().slice(0, 10);
// Versienummer achter css/js-links: dwingt browsers om na een wijziging
// het nieuwe bestand op te halen in plaats van een oude kopie uit de cache.
const ASSET_VERSIE = "20260716j";

const data = JSON.parse(readFileSync(resolve(ROOT, "data/batterijen.json"), "utf8"));
mkdirSync(resolve(ROOT, "batterij"), { recursive: true });

/* ------------------------------------------------------------------ */

const esc = (s) => String(s == null ? "" : s)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const eur = (n) => "€ " + Number(n).toLocaleString("nl-NL", { maximumFractionDigits: 0 });
const nl = (n) => String(n).replace(".", ",");

function bestePrijs(b) {
  const a = (b.aanbiedingen || []).filter((x) => x && x.prijs_eur);
  if (a.length) return a.reduce((m, x) => (x.prijs_eur < m.prijs_eur ? x : m));
  if (b.richtprijs_eur) return { winkel: b.prijs_bron || "richtprijs", prijs_eur: b.richtprijs_eur, url: b.product_url };
  return null;
}

function driewaardig(v) {
  if (v === true) return { status: "ja", tekst: "Ja" };
  if (typeof v === "string" && v.trim()) return { status: "deels", tekst: v };
  return { status: "nee", tekst: "Nee" };
}

function vierwaardig(v) {
  if (v === undefined || v === null) return { status: "onbekend", tekst: "Onbekend; controleer dit bij de leverancier" };
  return driewaardig(v);
}

function totaalprijsTekst(b) {
  if (!b.totaalprijs_van_eur) return null;
  return eur(b.totaalprijs_van_eur) + (b.totaalprijs_tot_eur ? " tot " + eur(b.totaalprijs_tot_eur) : "");
}

function sterren(score) {
  const s = Math.max(0, Math.min(5, Math.round(score || 0)));
  return "★".repeat(s) + "☆".repeat(5 - s);
}

// Slim-score: zelfde formule als assets/app.js en uitleg.html#slim-score.
// Homey, Home Assistant en dynamisch contract tellen elk: ja = 2, deels = 1, nee = 0.
function slimScore(b) {
  const punt = (v) => { const s = driewaardig(v).status; return s === "ja" ? 2 : s === "deels" ? 1 : 0; };
  return punt(b.homey) + punt(b.home_assistant) + punt(b.dynamisch_contract);
}

function slimScoreBadge(b) {
  const score = slimScore(b);
  const klasse = score >= 5 ? "slim-hoog" : score >= 3 ? "slim-midden" : "slim-laag";
  return `<span class="badge slim-score ${klasse}" title="Punten voor Homey, Home Assistant en dynamisch contract">\u{1F3E0} Slim-score ${score}/6</span>`;
}

// Merklogo: officiële logo's uit assets/logos/, geregistreerd in data (merk_logos)
function merkLogoHtml(merk) {
  const logo = (data.merk_logos || {})[merk];
  return logo ? `<img class="merk-logo" src="/${esc(logo)}" alt="" loading="lazy"> ` : "";
}

// Mini-illustraties per batterijtype, in de huisstijl (inkt-teal, teal, amber).
// Eigen tekeningen, dus geen rechtenkwesties.
function typeIllustratie(type) {
  const svgs = {
    "plug-in": `<svg viewBox="0 0 170 120" role="img" aria-label="Stekkerbatterij: batterij met stekker in een gewoon stopcontact" class="type-illustratie">
      <rect x="14" y="26" width="58" height="82" rx="9" fill="#0e4f49"/>
      <rect x="24" y="84" width="38" height="11" rx="3" fill="#2dd4bf"/>
      <rect x="24" y="68" width="38" height="11" rx="3" fill="#2dd4bf"/>
      <rect x="24" y="52" width="38" height="11" rx="3" fill="#2dd4bf" opacity="0.45"/>
      <circle cx="43" cy="38" r="4" fill="#f59e0b"/>
      <path d="M 72 60 C 100 60, 104 74, 124 74" fill="none" stroke="#0a3733" stroke-width="4" stroke-linecap="round"/>
      <rect x="124" y="66" width="14" height="16" rx="3" fill="#0a3733"/>
      <rect x="142" y="52" width="22" height="44" rx="6" fill="#ffffff" stroke="#0a3733" stroke-width="3"/>
      <circle cx="153" cy="68" r="2.6" fill="#0a3733"/>
      <circle cx="153" cy="80" r="2.6" fill="#0a3733"/>
      <text x="14" y="16" font-size="11" font-weight="700" fill="#0a3733">zelf aansluiten</text>
    </svg>`,
    "ac-gekoppeld": `<svg viewBox="0 0 170 120" role="img" aria-label="AC-gekoppelde batterij: aangesloten op de meterkast, werkt naast elk zonnepanelensysteem" class="type-illustratie">
      <rect x="14" y="26" width="58" height="82" rx="9" fill="#0e4f49"/>
      <rect x="24" y="84" width="38" height="11" rx="3" fill="#2dd4bf"/>
      <rect x="24" y="68" width="38" height="11" rx="3" fill="#2dd4bf"/>
      <rect x="24" y="52" width="38" height="11" rx="3" fill="#2dd4bf" opacity="0.45"/>
      <circle cx="43" cy="38" r="4" fill="#f59e0b"/>
      <path d="M 72 66 L 116 66" fill="none" stroke="#0a3733" stroke-width="4" stroke-linecap="round" stroke-dasharray="8 6"/>
      <rect x="116" y="30" width="42" height="78" rx="6" fill="#ffffff" stroke="#0a3733" stroke-width="3"/>
      <circle cx="137" cy="52" r="10" fill="none" stroke="#0f766e" stroke-width="3"/>
      <line x1="137" y1="52" x2="143" y2="46" stroke="#0f766e" stroke-width="3" stroke-linecap="round"/>
      <rect x="126" y="74" width="22" height="8" rx="2" fill="#f59e0b"/>
      <rect x="126" y="88" width="22" height="8" rx="2" fill="#0f766e" opacity="0.4"/>
      <text x="14" y="16" font-size="11" font-weight="700" fill="#0a3733">via de meterkast</text>
    </svg>`,
    "hybride": `<svg viewBox="0 0 170 120" role="img" aria-label="Hybride systeem: zonnepanelen en batterij delen één omvormer" class="type-illustratie">
      <g transform="rotate(-14 40 44)">
        <rect x="16" y="30" width="24" height="17" rx="2" fill="#0f766e" stroke="#0a3733" stroke-width="2"/>
        <rect x="43" y="30" width="24" height="17" rx="2" fill="#0f766e" stroke="#0a3733" stroke-width="2"/>
        <rect x="16" y="50" width="24" height="17" rx="2" fill="#0f766e" stroke="#0a3733" stroke-width="2"/>
        <rect x="43" y="50" width="24" height="17" rx="2" fill="#0f766e" stroke="#0a3733" stroke-width="2"/>
      </g>
      <path d="M 72 52 L 92 52" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round" stroke-dasharray="7 6"/>
      <rect x="92" y="34" width="34" height="36" rx="6" fill="#ffffff" stroke="#0a3733" stroke-width="3"/>
      <path d="M 99 52 q 5 -8 10 0 q 5 8 10 0" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round"/>
      <path d="M 109 70 L 109 82" fill="none" stroke="#0a3733" stroke-width="4" stroke-linecap="round"/>
      <rect x="82" y="82" width="54" height="30" rx="7" fill="#0e4f49"/>
      <rect x="92" y="90" width="34" height="9" rx="3" fill="#2dd4bf"/>
      <circle cx="130" cy="89" r="3" fill="#f59e0b"/>
      <text x="92" y="16" font-size="11" font-weight="700" fill="#0a3733">één omvormer</text>
      <text x="92" y="28" font-size="11" font-weight="700" fill="#0a3733">voor alles</text>
    </svg>`,
  };
  return svgs[type] || "";
}

/* ------------------------------------------------------------------ */

function productLd(b) {
  const offers = (b.aanbiedingen || []).filter((a) => a && a.prijs_eur);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": `${b.merk} ${b.model}`,
    "brand": { "@type": "Brand", "name": b.merk },
    "description": `${b.merk} ${b.model}: thuisbatterij van ${nl(b.capaciteit_kwh)} kWh. ${b.zonnepanelen_koppeling || ""}`.slice(0, 300),
    "url": `${SITE}/batterij/${b.id}.html`,
  };
  if (offers.length === 1) {
    ld.offers = { "@type": "Offer", "price": offers[0].prijs_eur, "priceCurrency": "EUR", "url": offers[0].url };
  } else if (offers.length > 1) {
    const prijzen = offers.map((o) => o.prijs_eur);
    ld.offers = {
      "@type": "AggregateOffer",
      "lowPrice": Math.min(...prijzen),
      "highPrice": Math.max(...prijzen),
      "priceCurrency": "EUR",
      "offerCount": offers.length,
    };
  }
  return JSON.stringify(ld, null, 2);
}

function pagina(b) {
  const beste = bestePrijs(b);
  const totaal = totaalprijsTekst(b);
  const perKwh = beste && b.capaciteit_kwh ? Math.round(beste.prijs_eur / b.capaciteit_kwh) : null;
  const homey = driewaardig(b.homey);
  const ha = driewaardig(b.home_assistant);
  const dyn = driewaardig(b.dynamisch_contract);
  const nood = vierwaardig(b.noodstroom);
  const typeLabel = { "plug-in": "Plug-in (stopcontact)", "ac-gekoppeld": "AC-gekoppeld", "hybride": "Hybride omvormer" }[b.type] || b.type;

  const metaDesc = `${b.merk} ${b.model}: ${nl(b.capaciteit_kwh)} kWh thuisbatterij` +
    (beste ? `, vanaf ${eur(beste.prijs_eur).replace(" ", " ")} bij ${beste.winkel}` : "") +
    ". Bekijk specificaties, koppeling met zonnepanelen, Homey en Home Assistant, en bereken je terugverdientijd.";

  const specRij = (label, waarde) => waarde == null || waarde === "" ? "" :
    `<tr><th style="text-align:left;padding:10px 14px;background:var(--kleur-achtergrond);white-space:nowrap;width:40%;">${esc(label)}</th><td style="padding:10px 14px;">${waarde}</td></tr>`;

  const badgeIcoon = { ja: "✓", deels: "~", nee: "✕", onbekend: "?" };
  const badge = (label, d) =>
    `<span class="badge ${d.status}" title="${esc(d.tekst || "")}">${badgeIcoon[d.status] || "?"} ${esc(label)}</span>`;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(b.merk)} ${esc(b.model)}: prijs, specificaties en beste aanbieding | Batterijmaatje.nl</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${SITE}/batterij/${esc(b.id)}.html">
  <meta property="og:title" content="${esc(b.merk)} ${esc(b.model)}: prijs en specificaties">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:type" content="product">
  <meta property="og:url" content="${SITE}/batterij/${esc(b.id)}.html">
  <meta property="og:locale" content="nl_NL">
  <meta property="og:image" content="${SITE}/assets/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Batterijmaatje.nl">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">
${productLd(b)}
  </script>
  <link rel="stylesheet" href="/assets/style.css?v=${ASSET_VERSIE}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
</head>
<body>

<header class="site-header">
  <div class="container">
    <a class="logo" href="/index.html">
      <span class="logo-icoon">\u{1F50B}</span>
      <span>Batterij<b>maatje</b></span>
    </a>
    <nav class="hoofdnav">
      <a href="/index.html">Vergelijken</a>
      <a href="/uitleg.html">Uitleg</a>
      <a href="/advies.html">Keuzehulp</a>
      <a href="/rekenmodule.html">Terugverdientijd</a>
      <details class="nav-meer">
        <summary>Meer ▾</summary>
        <div class="nav-meer-paneel">
          <a href="/regelgeving.html">Regels &amp; subsidies</a>
          <a href="/beste-thuisbatterij-home-assistant.html">Beste voor Home Assistant</a>
          <a href="/beste-thuisbatterij-homey.html">Beste voor Homey</a>
          <a href="/over-ons.html">Over ons</a>
        </div>
      </details>
    </nav>
  </div>
</header>

<main class="content-pagina">

  <p class="datum-stempel"><a href="/index.html">Vergelijker</a> › ${esc(b.merk)} ${esc(b.model)}</p>
  <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;">
    <div style="flex:1;min-width:250px;">
      <h1>${merkLogoHtml(b.merk)}${esc(b.merk)} ${esc(b.model)}</h1>
      <p class="intro">${esc(typeLabel)} thuisbatterij van ${nl(b.capaciteit_kwh)} kWh${b.uitbreidbaar_tot_kwh ? `, uitbreidbaar tot ${nl(b.uitbreidbaar_tot_kwh)} kWh` : ""}. Prijzen dagelijks gecontroleerd, laatst op ${esc(b.prijs_datum || data.laatst_bijgewerkt)}.</p>
    </div>
    ${typeIllustratie(b.type)}
  </div>

  <div class="info-kader">
    ${beste ? `<div style="font-size:1.6rem;font-weight:800;">${eur(beste.prijs_eur)} <span style="font-size:0.95rem;font-weight:400;color:var(--kleur-tekst-licht);">bij ${esc(beste.winkel)}${perKwh ? ` · ${eur(perKwh)} per kWh opslag` : ""}</span></div>` : "<div><b>Prijs op aanvraag</b></div>"}
    ${b.prijs_omvat ? `<div style="font-size:0.9rem;color:var(--kleur-tekst-licht);">Deze prijs dekt: ${esc(b.prijs_omvat)}</div>` : ""}
    <div style="font-size:0.95rem;margin-top:6px;" title="${esc(b.totaalprijs_toelichting || "")}">Compleet gebruiksklaar (indicatie): <b>${totaal || "op aanvraag"}</b></div>
    <p style="margin:14px 0 0;">
      ${beste && beste.url ? `<a class="knop" href="${esc(beste.affiliate_url || beste.url)}" target="_blank" rel="noopener sponsored">Bekijk aanbieding →</a>&nbsp;` : ""}
      <a class="knop knop-secundair" href="/rekenmodule.html?batterij=${encodeURIComponent(b.id)}">Bereken terugverdientijd</a>
    </p>
  </div>

  <h2>Specificaties</h2>
  <div style="overflow-x:auto;background:var(--kleur-wit);border:1px solid var(--kleur-rand);border-radius:var(--radius);">
  <table style="width:100%;border-collapse:collapse;font-size:0.95rem;">
    ${specRij("Capaciteit", `${nl(b.capaciteit_kwh)} kWh${b.uitbreidbaar_tot_kwh ? ` (uitbreidbaar tot ${nl(b.uitbreidbaar_tot_kwh)} kWh)` : ""}`)}
    ${specRij("Vermogen", b.vermogen_kw ? `${nl(b.vermogen_kw)} kW` : null)}
    ${specRij("Type", `<a class="term-link" href="/uitleg.html#${esc(b.type)}" title="Wat betekent dit? Lees de uitleg in de woordenlijst">${esc(typeLabel)}</a>`)}
    ${specRij("Aansluiting", esc(b.fase || ""))}
    ${specRij("Installatie", b.installatie === "zelf" ? "Zelf aan te sluiten (stopcontact)" : "Door installateur")}
    ${specRij("Garantie", b.garantie_jaar ? `${b.garantie_jaar} jaar` : null)}
    ${specRij("Laadcycli", b.cycli ? esc(String(b.cycli)) : null)}
    ${specRij("App", b.app ? `${esc(b.app)} <small>(<a class="term-link" href="/uitleg.html#fabrikant-app" title="Wat kan de app van de fabrikant? Lees de uitleg">wat kan zo'n app?</a>)</small>` : "")}
  </table>
  </div>
  <p class="datum-stempel">Onbekende term (zoals kWh of hybride)? Alle woorden staan uitgelegd in de <a href="/uitleg.html#woordenlijst">woordenlijst</a>.</p>

  <h2>Koppeling met zonnepanelen</h2>
  <p><span style="color:var(--kleur-accent);letter-spacing:2px;">${sterren(b.koppeling_gemak)}</span> (koppelgemak: ${b.koppeling_gemak || "?"} van 5)</p>
  <p>${esc(b.zonnepanelen_koppeling || "")}</p>

  <h2>Smart home en slim aansturen</h2>
  <p style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">${slimScoreBadge(b)} ${badge("Homey", homey)} ${badge("Home Assistant", ha)} ${badge("Dynamisch contract", dyn)}</p>
  <p class="datum-stempel">De <a href="/uitleg.html#slim-score">Slim-score</a> telt de ondersteuning voor Homey, Home Assistant en een dynamisch contract op: 2 punten per volledige, 1 per gedeeltelijke ondersteuning.</p>
  <ul>
    <li><b>Homey:</b> ${esc(homey.tekst)}</li>
    <li><b>Home Assistant:</b> ${esc(ha.tekst)}</li>
    <li><b>Dynamisch energiecontract:</b> ${esc(dyn.tekst)}</li>
  </ul>

  <h2>Noodstroom en zelfvoorzienendheid</h2>
  <p><b><a class="term-link" href="/uitleg.html#noodstroom" title="Wat is noodstroom? Lees de uitleg">Noodstroom</a> bij stroomuitval:</b> ${nood.status === "ja" ? "Ja. " : nood.status === "nee" ? "Nee. " : nood.status === "onbekend" ? "Onbekend. " : ""}${esc(b.noodstroom_uitleg || nood.tekst)}</p>
  <p class="datum-stempel">Goed om te weten: volledig zelfvoorzienend (van het net af) is in Nederland vrijwel nooit haalbaar vanwege de lage winteropbrengst van zonnepanelen. Noodstroom betekent dat (een deel van) je huis blijft werken tijdens een storing; veel plug-in batterijen vallen dan juist uit omdat ze met het net meedraaien.</p>

  ${b.opmerkingen ? `<h2>Goed om te weten</h2><p>${esc(b.opmerkingen)}</p>` : ""}

  ${(b.aanbiedingen || []).length ? `<h2>Verkrijgbaar bij</h2>
  <ul>
    ${b.aanbiedingen.map((a) => `<li><a href="${esc(a.affiliate_url || a.url)}" target="_blank" rel="noopener sponsored">${esc(a.winkel)}</a>: <b>${eur(a.prijs_eur)}</b> <span class="datum-stempel">${a.datum ? `(gecontroleerd ${esc(a.datum)})` : "(prijsindicatie; klik voor de actuele prijs)"}</span></li>`).join("\n    ")}
  </ul>
  <p class="datum-stempel">Prijzen worden dagelijks automatisch gecontroleerd; de prijs op de website van de winkel is altijd leidend.${(b.aanbiedingen || []).some((a) => a.affiliate_url) ? " Sommige links zijn commissielinks: koop je via die link, dan ontvangen wij een kleine vergoeding van de winkel. Dit kost jou niets en be\u00efnvloedt onze prijzen, scores en volgorde niet." : ""}</p>` : ""}

  <div class="waarschuwing-kader">Twijfel je of deze batterij bij je past? Doe de <a href="/advies.html">keuzehulp</a> voor een maatadvies, of <a href="/index.html">vergelijk alle thuisbatterijen</a> op prijs, capaciteit en koppelgemak.</div>

  ${b.product_url ? `<p>Meer informatie: <a href="${esc(b.product_url)}" target="_blank" rel="noopener">officiële productpagina van ${esc(b.merk)}</a>.</p>` : ""}

</main>

<footer class="site-footer">
  <div class="container">
    <b>\u{1F50B} Batterijmaatje</b>
    <p>Onafhankelijke vergelijking van thuisbatterijen voor Nederlandse huishoudens.</p>
    <p><a href="/index.html">Vergelijken</a> · <a href="/uitleg.html">Uitleg</a> · <a href="/advies.html">Keuzehulp</a> · <a href="/rekenmodule.html">Terugverdientijd</a> · <a href="/regelgeving.html">Regels &amp; subsidies</a> · <a href="/index.html#veelgestelde-vragen">Veelgestelde vragen</a> · <a href="/beste-thuisbatterij-home-assistant.html">Beste voor Home Assistant</a> · <a href="/beste-thuisbatterij-homey.html">Beste voor Homey</a> · <a href="/over-ons.html">Over ons</a> · <a href="/privacy.html">Privacy &amp; disclaimer</a></p>
    <p class="disclaimer">Disclaimer: prijzen en specificaties veranderen regelmatig; er kunnen geen rechten aan worden ontleend. De prijs en voorwaarden op de website van de aanbieder zijn altijd leidend.</p>
  </div>
</footer>

</body>
</html>
`;
}

/* ------------------------------------------------------------------
   Overzichtspagina's per smart-home-platform (SEO-landingspagina's).
   Worden dagelijks mee-gegenereerd, zodat prijzen en de lijst met
   ondersteunde batterijen automatisch actueel blijven.
   ------------------------------------------------------------------ */

const OVERZICHTEN = [
  {
    bestand: "beste-thuisbatterij-home-assistant.html",
    veld: "home_assistant",
    naam: "Home Assistant",
    anker: "home-assistant",
    intro: "Home Assistant is het populairste gratis smart-home-platform voor wie zijn huis zelf wil automatiseren. Een thuisbatterij die je in Home Assistant kunt uitlezen en aansturen, kun je laten samenwerken met je zonnepanelen, dynamische stroomprijzen en de rest van je slimme huis. Maar de ondersteuning verschilt enorm per merk: van een officiële integratie die je in twee minuten koppelt tot helemaal niets.",
    deelsUitleg: "Bij deze batterijen werkt de koppeling via een omweg: een community-integratie (HACS), een lokale API of Modbus. Dat werkt vaak prima, maar vraagt wat meer handigheid en kan na een firmware-update van de fabrikant haperen.",
  },
  {
    bestand: "beste-thuisbatterij-homey.html",
    veld: "homey",
    naam: "Homey",
    anker: "homey",
    intro: "Homey is het laagdrempelige smart-home-kastje waarmee je apparaten in huis laat samenwerken zonder te programmeren. Een thuisbatterij met een goede Homey-app kun je automatisch laten laden op goedkope uren en meenemen in je energie-overzicht. De ondersteuning verschilt per merk: sommige batterijen hebben een officiële app, andere werken alleen via een community-app of de Homey Energy Dongle.",
    deelsUitleg: "Bij deze batterijen loopt de koppeling via een community-app, een extra kastje (zoals de Homey Energy Dongle) of een beperkte integratie. Vaak goed werkbaar, maar geen officiële ondersteuning van de fabrikant.",
  },
];

function overzichtRij(b) {
  const beste = bestePrijs(b);
  const perKwh = beste && b.capaciteit_kwh ? Math.round(beste.prijs_eur / b.capaciteit_kwh) : null;
  return { b, beste, perKwh };
}

function overzichtTabel(lijst, veld) {
  const rijen = lijst.map(overzichtRij).sort((a, x) => (a.perKwh || Infinity) - (x.perKwh || Infinity));
  return `<div style="overflow-x:auto;background:var(--kleur-wit);border:1px solid var(--kleur-rand);border-radius:var(--radius);margin:14px 0;">
  <table style="width:100%;border-collapse:collapse;font-size:0.93rem;min-width:640px;">
    <thead><tr>
      <th style="text-align:left;padding:10px 14px;background:var(--kleur-achtergrond);">Batterij</th>
      <th style="text-align:left;padding:10px 14px;background:var(--kleur-achtergrond);">Capaciteit</th>
      <th style="text-align:left;padding:10px 14px;background:var(--kleur-achtergrond);">Beste prijs</th>
      <th style="text-align:left;padding:10px 14px;background:var(--kleur-achtergrond);">Per kWh</th>
      <th style="text-align:left;padding:10px 14px;background:var(--kleur-achtergrond);">Slim-score</th>
      <th style="text-align:left;padding:10px 14px;background:var(--kleur-achtergrond);">Hoe werkt de koppeling?</th>
    </tr></thead>
    <tbody>${rijen.map(({ b, beste, perKwh }) => {
      const d = driewaardig(b[veld]);
      return `
      <tr>
        <td style="padding:10px 14px;border-top:1px solid var(--kleur-rand);">${merkLogoHtml(b.merk)}<a href="/batterij/${esc(b.id)}.html"><b>${esc(b.merk)} ${esc(b.model)}</b></a></td>
        <td style="padding:10px 14px;border-top:1px solid var(--kleur-rand);white-space:nowrap;">${nl(b.capaciteit_kwh)} kWh</td>
        <td style="padding:10px 14px;border-top:1px solid var(--kleur-rand);white-space:nowrap;">${beste ? `<b>${eur(beste.prijs_eur)}</b><br><small>bij ${esc(beste.winkel)}</small>` : "op aanvraag"}</td>
        <td style="padding:10px 14px;border-top:1px solid var(--kleur-rand);white-space:nowrap;">${perKwh ? eur(perKwh) : "n.b."}</td>
        <td style="padding:10px 14px;border-top:1px solid var(--kleur-rand);white-space:nowrap;"><b>${slimScore(b)}/6</b></td>
        <td style="padding:10px 14px;border-top:1px solid var(--kleur-rand);">${d.status === "ja" ? "Officiële ondersteuning" : esc(d.tekst)}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>
  </div>`;
}

function overzichtsPagina(cfg) {
  const ja = data.batterijen.filter((b) => driewaardig(b[cfg.veld]).status === "ja");
  const deels = data.batterijen.filter((b) => driewaardig(b[cfg.veld]).status === "deels");
  const nee = data.batterijen.filter((b) => driewaardig(b[cfg.veld]).status === "nee");
  const titel = `Beste thuisbatterij voor ${cfg.naam} (2026): ${ja.length + deels.length} modellen vergeleken`;
  const metaDesc = `Welke thuisbatterij werkt met ${cfg.naam}? Overzicht van ${ja.length} batterijen met volledige en ${deels.length} met gedeeltelijke ondersteuning, met actuele prijzen, prijs per kWh en Slim-score. Dagelijks bijgewerkt.`;
  const alleGetoond = [...ja, ...deels];

  const itemList = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": titel,
    "itemListElement": alleGetoond.map((b, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": `${b.merk} ${b.model}`,
      "url": `${SITE}/batterij/${b.id}.html`,
    })),
  }, null, 2);

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(titel)} | Batterijmaatje.nl</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${SITE}/${cfg.bestand}">
  <meta property="og:title" content="${esc(titel)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE}/${cfg.bestand}">
  <meta property="og:locale" content="nl_NL">
  <meta property="og:image" content="${SITE}/assets/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Batterijmaatje.nl">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">
${itemList}
  </script>
  <link rel="stylesheet" href="/assets/style.css?v=${ASSET_VERSIE}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
</head>
<body>

<header class="site-header">
  <div class="container">
    <a class="logo" href="/index.html">
      <span class="logo-icoon">\u{1F50B}</span>
      <span>Batterij<b>maatje</b></span>
    </a>
    <nav class="hoofdnav">
      <a href="/index.html">Vergelijken</a>
      <a href="/uitleg.html">Uitleg</a>
      <a href="/advies.html">Keuzehulp</a>
      <a href="/rekenmodule.html">Terugverdientijd</a>
      <details class="nav-meer">
        <summary>Meer ▾</summary>
        <div class="nav-meer-paneel">
          <a href="/regelgeving.html">Regels &amp; subsidies</a>
          <a href="/beste-thuisbatterij-home-assistant.html">Beste voor Home Assistant</a>
          <a href="/beste-thuisbatterij-homey.html">Beste voor Homey</a>
          <a href="/over-ons.html">Over ons</a>
        </div>
      </details>
    </nav>
  </div>
</header>

<main class="container" style="max-width:900px;">
  <p class="datum-stempel" style="margin-top:22px;"><a href="/index.html">← Alle thuisbatterijen vergelijken</a></p>
  <h1>Beste thuisbatterij voor ${esc(cfg.naam)} (2026)</h1>
  <p class="datum-stempel">Dagelijks automatisch bijgewerkt · laatst gecontroleerd op ${VANDAAG}</p>
  <p>${esc(cfg.intro)}</p>
  <p>Hieronder zie je alle ${data.batterijen.length} thuisbatterijen uit onze vergelijker, ingedeeld naar ${esc(cfg.naam)}-ondersteuning. De prijzen worden dagelijks automatisch gecontroleerd bij de winkels. De <a href="/uitleg.html#slim-score">Slim-score</a> (0 tot 6 punten) telt daarnaast ook de ondersteuning voor ${cfg.veld === "homey" ? "Home Assistant" : "Homey"} en een dynamisch energiecontract mee.</p>

  <h2>✓ Volledige ${esc(cfg.naam)}-ondersteuning (${ja.length})</h2>
  <p>Deze batterijen hebben een officiële ${esc(cfg.naam)}-koppeling van de fabrikant. Installeren, koppelen en klaar.</p>
  ${overzichtTabel(ja, cfg.veld)}

  <h2>~ Gedeeltelijke ondersteuning (${deels.length})</h2>
  <p>${esc(cfg.deelsUitleg)}</p>
  ${overzichtTabel(deels, cfg.veld)}

  <h2>✕ Geen ${esc(cfg.naam)}-ondersteuning (${nee.length})</h2>
  <p>${nee.length ? `Van deze batterijen is geen bruikbare ${esc(cfg.naam)}-koppeling bekend: ${nee.map((b) => `<a href="/batterij/${esc(b.id)}.html">${esc(b.merk)} ${esc(b.model)}</a>`).join(", ")}.` : `Alle batterijen in onze vergelijker hebben een vorm van ${esc(cfg.naam)}-ondersteuning.`}</p>

  <h2>Zo kies je</h2>
  <ul>
    <li><b>Wil je zekerheid?</b> Kies een batterij uit de eerste tabel: officiële ondersteuning blijft werken na updates en de fabrikant helpt bij problemen.</li>
    <li><b>Ben je handig?</b> De tweede tabel biedt vaak meer batterij voor je geld; community-integraties werken meestal goed, maar zonder garantie.</li>
    <li><b>Twijfel je over de maat?</b> Doe de <a href="/advies.html">keuzehulp</a>: die rekent uit welke capaciteit bij je verbruik past.</li>
    <li><b>Wat is ${esc(cfg.naam)} eigenlijk?</b> Lees de eenvoudige uitleg in onze <a href="/uitleg.html#${cfg.anker}">woordenlijst</a>.</li>
  </ul>

  <h2>Geen ${esc(cfg.naam)}? Er zijn meer manieren om slim aan te sturen</h2>
  <ul>
    <li><b><a class="term-link" href="/uitleg.html#fabrikant-app">De app van de fabrikant</a>.</b> Elke batterij heeft een eigen app; veel apps kunnen zelf al slim laden op dynamische uurprijzen. Je hebt dus geen apart smart-home-systeem nodig om een batterij te gebruiken.</li>
    <li><b><a class="term-link" href="/uitleg.html#leverancier-sturing">Aansturing door je energieleverancier</a>.</b> Leveranciers met dynamische contracten zoals Tibber, Frank Energie en Zonneplan kunnen bepaalde batterijen volledig automatisch aansturen, soms inclusief handel op de onbalansmarkt. Controleer vóór aanschaf of jouw batterij wordt ondersteund.</li>
    <li><b><a class="term-link" href="/uitleg.html#matter">Matter</a>.</b> De universele smart-home-standaard van onder meer Apple, Google en Samsung ondersteunt in de nieuwste versies ook thuisbatterijen. In de praktijk kunnen nog maar weinig batterijen dit; de verwachting is dat dit de komende jaren groeit.</li>
  </ul>

  <div class="waarschuwing-kader">Prijzen en integraties veranderen regelmatig. Deze pagina wordt dagelijks automatisch bijgewerkt vanuit onze <a href="/index.html">vergelijker</a>; de prijs en specificaties op de website van de winkel zijn altijd leidend.</div>
</main>

<footer class="site-footer">
  <div class="container">
    <b>\u{1F50B} Batterijmaatje</b>
    <p>Onafhankelijke vergelijking van thuisbatterijen voor Nederlandse huishoudens.</p>
    <p><a href="/index.html">Vergelijken</a> · <a href="/uitleg.html">Uitleg</a> · <a href="/advies.html">Keuzehulp</a> · <a href="/rekenmodule.html">Terugverdientijd</a> · <a href="/regelgeving.html">Regels &amp; subsidies</a> · <a href="/index.html#veelgestelde-vragen">Veelgestelde vragen</a> · <a href="/beste-thuisbatterij-home-assistant.html">Beste voor Home Assistant</a> · <a href="/beste-thuisbatterij-homey.html">Beste voor Homey</a> · <a href="/over-ons.html">Over ons</a> · <a href="/privacy.html">Privacy &amp; disclaimer</a></p>
    <p class="disclaimer">Disclaimer: prijzen en specificaties veranderen regelmatig; er kunnen geen rechten aan worden ontleend. De prijs en voorwaarden op de website van de aanbieder zijn altijd leidend.</p>
  </div>
</footer>

</body>
</html>
`;
}

/* ------------------------------------------------------------------
   Pagina's schrijven
   ------------------------------------------------------------------ */

for (const b of data.batterijen) {
  writeFileSync(resolve(ROOT, "batterij", `${b.id}.html`), pagina(b), "utf8");
}
console.log(`${data.batterijen.length} batterijpagina's gegenereerd in /batterij/`);

for (const cfg of OVERZICHTEN) {
  writeFileSync(resolve(ROOT, cfg.bestand), overzichtsPagina(cfg), "utf8");
}
console.log(`${OVERZICHTEN.length} overzichtspagina's gegenereerd (Home Assistant, Homey)`);

/* ------------------------------------------------------------------
   Sitemap herbouwen (vaste pagina's + batterijpagina's)
   ------------------------------------------------------------------ */

const vast = [
  { loc: `${SITE}/`, freq: "daily", prio: "1.0" },
  { loc: `${SITE}/uitleg.html`, freq: "monthly", prio: "0.8" },
  { loc: `${SITE}/advies.html`, freq: "weekly", prio: "0.9" },
  { loc: `${SITE}/rekenmodule.html`, freq: "weekly", prio: "0.8" },
  { loc: `${SITE}/regelgeving.html`, freq: "monthly", prio: "0.8" },
  { loc: `${SITE}/beste-thuisbatterij-home-assistant.html`, freq: "daily", prio: "0.8" },
  { loc: `${SITE}/beste-thuisbatterij-homey.html`, freq: "daily", prio: "0.8" },
  { loc: `${SITE}/over-ons.html`, freq: "monthly", prio: "0.4" },
  { loc: `${SITE}/privacy.html`, freq: "yearly", prio: "0.2" },
];

const urls = [
  ...vast,
  ...data.batterijen.map((b) => ({ loc: `${SITE}/batterij/${b.id}.html`, freq: "daily", prio: "0.7" })),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${VANDAAG}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.prio}</priority>\n  </url>`).join("\n") +
  `\n</urlset>\n`;

writeFileSync(resolve(ROOT, "sitemap.xml"), sitemap, "utf8");
console.log(`sitemap.xml herbouwd met ${urls.length} URL's (lastmod ${VANDAAG})`);
