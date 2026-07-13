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

  const badge = (label, d) =>
    `<span class="badge ${d.status}" title="${esc(d.status === "deels" ? d.tekst : "")}">${d.status === "nee" ? "✕" : "✓"} ${esc(label)}</span>`;

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
  <link rel="stylesheet" href="/assets/style.css">
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
      <a href="/regelgeving.html">Regels &amp; subsidies</a>
    </nav>
  </div>
</header>

<main class="content-pagina">

  <p class="datum-stempel"><a href="/index.html">Vergelijker</a> › ${esc(b.merk)} ${esc(b.model)}</p>
  <h1>${esc(b.merk)} ${esc(b.model)}</h1>
  <p class="intro">${esc(typeLabel)} thuisbatterij van ${nl(b.capaciteit_kwh)} kWh${b.uitbreidbaar_tot_kwh ? `, uitbreidbaar tot ${nl(b.uitbreidbaar_tot_kwh)} kWh` : ""}. Prijzen dagelijks gecontroleerd, laatst op ${esc(b.prijs_datum || data.laatst_bijgewerkt)}.</p>

  <div class="info-kader">
    ${beste ? `<div style="font-size:1.6rem;font-weight:800;">${eur(beste.prijs_eur)} <span style="font-size:0.95rem;font-weight:400;color:var(--kleur-tekst-licht);">bij ${esc(beste.winkel)}${perKwh ? ` · ${eur(perKwh)} per kWh opslag` : ""}</span></div>` : "<div><b>Prijs op aanvraag</b></div>"}
    ${b.prijs_omvat ? `<div style="font-size:0.9rem;color:var(--kleur-tekst-licht);">Deze prijs dekt: ${esc(b.prijs_omvat)}</div>` : ""}
    <div style="font-size:0.95rem;margin-top:6px;" title="${esc(b.totaalprijs_toelichting || "")}">Compleet gebruiksklaar (indicatie): <b>${totaal || "op aanvraag"}</b></div>
    <p style="margin:14px 0 0;">
      ${beste && beste.url ? `<a class="knop" href="${esc(beste.url)}" target="_blank" rel="noopener sponsored">Bekijk aanbieding →</a>&nbsp;` : ""}
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
    ${specRij("App", esc(b.app || ""))}
  </table>
  </div>
  <p class="datum-stempel">Onbekende term (zoals kWh of hybride)? Alle woorden staan uitgelegd in de <a href="/uitleg.html#woordenlijst">woordenlijst</a>.</p>

  <h2>Koppeling met zonnepanelen</h2>
  <p><span style="color:var(--kleur-accent);letter-spacing:2px;">${sterren(b.koppeling_gemak)}</span> (koppelgemak: ${b.koppeling_gemak || "?"} van 5)</p>
  <p>${esc(b.zonnepanelen_koppeling || "")}</p>

  <h2>Smart home en slim aansturen</h2>
  <p style="display:flex;gap:8px;flex-wrap:wrap;">${badge("Homey", homey)} ${badge("Home Assistant", ha)} ${badge("Dynamisch contract", dyn)}</p>
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
    ${b.aanbiedingen.map((a) => `<li><a href="${esc(a.url)}" target="_blank" rel="noopener sponsored">${esc(a.winkel)}</a>: <b>${eur(a.prijs_eur)}</b> <span class="datum-stempel">(gecontroleerd ${esc(a.datum || "")})</span></li>`).join("\n    ")}
  </ul>
  <p class="datum-stempel">Prijzen worden dagelijks automatisch gecontroleerd; de prijs op de website van de winkel is altijd leidend.</p>` : ""}

  <div class="waarschuwing-kader">Twijfel je of deze batterij bij je past? Doe de <a href="/advies.html">keuzehulp</a> voor een maatadvies, of <a href="/index.html">vergelijk alle thuisbatterijen</a> op prijs, capaciteit en koppelgemak.</div>

  ${b.product_url ? `<p>Meer informatie: <a href="${esc(b.product_url)}" target="_blank" rel="noopener">officiële productpagina van ${esc(b.merk)}</a>.</p>` : ""}

</main>

<footer class="site-footer">
  <div class="container">
    <b>\u{1F50B} Batterijmaatje</b>
    <p>Onafhankelijke vergelijking van thuisbatterijen voor Nederlandse huishoudens.</p>
    <p><a href="/index.html">Vergelijken</a> · <a href="/uitleg.html">Uitleg</a> · <a href="/advies.html">Keuzehulp</a> · <a href="/rekenmodule.html">Terugverdientijd</a> · <a href="/regelgeving.html">Regels &amp; subsidies</a> · <a href="/over-ons.html">Over ons</a> · <a href="/privacy.html">Privacy &amp; disclaimer</a></p>
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

/* ------------------------------------------------------------------
   Sitemap herbouwen (vaste pagina's + batterijpagina's)
   ------------------------------------------------------------------ */

const vast = [
  { loc: `${SITE}/`, freq: "daily", prio: "1.0" },
  { loc: `${SITE}/uitleg.html`, freq: "monthly", prio: "0.8" },
  { loc: `${SITE}/advies.html`, freq: "weekly", prio: "0.9" },
  { loc: `${SITE}/rekenmodule.html`, freq: "weekly", prio: "0.8" },
  { loc: `${SITE}/regelgeving.html`, freq: "monthly", prio: "0.8" },
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
