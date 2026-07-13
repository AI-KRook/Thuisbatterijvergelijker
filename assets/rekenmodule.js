/* ==========================================================================
   Rekenmodule terugverdientijd thuisbatterij
   Eenvoudig, transparant jaarmodel. Alle aannames zijn instelbaar en worden
   onder het resultaat getoond. Bewust conservatief; geen verkooppraatje.

   Model in het kort (per jaar, situatie vanaf 2027, dus zonder saldering):

   1. Zelfverbruik-opslag (alleen met zonnepanelen)
      overschot        = jaaropwek x (1 - direct eigen verbruik)
      opslag           = min(overschot, bruikbare capaciteit x zonnedagen) x mismatchfactor
      opbrengst        = opslag x (stroomprijs x rendement - terugleververgoeding + terugleverkosten per kWh)
      Toelichting: elke opgeslagen kWh vervangt inkoop (x rendement wegens
      omzetverlies), kost je de misgelopen terugleververgoeding en scheelt
      terugleverkosten.

   2. Handel op uurprijzen (alleen met dynamisch contract)
      dagen            = dagen zonder zonneoverschot (met PV) of vrijwel alle dagen (zonder PV)
      winst per cyclus = bruikbare capaciteit x (ontlaadwaarde x rendement - laadprijs)
      opbrengst        = dagen x cycli per dag x winst per cyclus
      Toelichting: 's nachts of op goedkope uren laden, op dure (avond)uren
      je eigen verbruik dekken of terugleveren.

   3. Terugverdientijd = investering / totale jaarlijkse opbrengst
   ========================================================================== */

(function () {
  "use strict";

  const el = (id) => document.getElementById(id);

  const eurFmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const eur2Fmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  const numFmt = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
  const jaarFmt = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });

  let batterijen = [];

  function bestePrijs(b) {
    const a = (b.aanbiedingen || []).filter((x) => x && x.prijs_eur);
    if (a.length) return a.reduce((m, x) => (x.prijs_eur < m.prijs_eur ? x : m)).prijs_eur;
    return b.richtprijs_eur || null;
  }

  function getal(id, fallback) {
    const v = parseFloat(String(el(id).value).replace(",", "."));
    return Number.isFinite(v) ? v : fallback;
  }

  /* ------------------------------------------------------------------
     Berekening
     ------------------------------------------------------------------ */

  function bereken() {
    const heeftPv = el("inpPv").value === "ja";
    const contract = el("inpContract").value; // "vast" | "dynamisch"

    const opwek = heeftPv ? getal("inpOpwek", 3500) : 0;
    const eigenVerbruikPct = getal("inpEigenVerbruik", 30) / 100;

    const stroomprijs = getal("inpStroomprijs", 0.30);
    const terugleverVergoeding = getal("inpTeruglever", 0.05);
    const terugleverKosten = getal("inpTerugleverkosten", 0.02);
    const laadprijs = getal("inpLaadprijs", 0.15);
    const ontlaadwaarde = getal("inpOntlaadwaarde", 0.32);

    const investering = getal("inpInvestering", 0);
    const capaciteit = getal("inpCapaciteit", 0);
    const bruikbaarPct = getal("inpBruikbaar", 90) / 100;
    const rendement = getal("inpRendement", 90) / 100;
    const zonDagen = getal("inpZonDagen", 220);
    const mismatch = getal("inpMismatch", 85) / 100;
    const cycliPerDag = getal("inpCycli", 1);
    const extraOnbalans = getal("inpOnbalans", 0);

    const bruikbareCap = capaciteit * bruikbaarPct;

    // 1. Zelfverbruik-opslag (alleen met PV)
    let overschot = 0, opslagJaar = 0, opbrengstZelf = 0;
    if (heeftPv && bruikbareCap > 0) {
      overschot = opwek * (1 - eigenVerbruikPct);
      opslagJaar = Math.min(overschot, bruikbareCap * zonDagen) * mismatch;
      const waardePerKwh = stroomprijs * rendement - terugleverVergoeding + terugleverKosten;
      opbrengstZelf = Math.max(0, opslagJaar * waardePerKwh);
    }

    // 2. Handel op uurprijzen (alleen dynamisch contract)
    let arbDagen = 0, opbrengstArb = 0, winstPerCyclus = 0;
    if (contract === "dynamisch" && bruikbareCap > 0) {
      arbDagen = heeftPv ? Math.max(0, 365 - zonDagen) : 350;
      winstPerCyclus = bruikbareCap * (ontlaadwaarde * rendement - laadprijs);
      opbrengstArb = Math.max(0, arbDagen * cycliPerDag * winstPerCyclus);
    }

    const totaal = opbrengstZelf + opbrengstArb + extraOnbalans;
    const terugverdientijd = totaal > 0 && investering > 0 ? investering / totaal : null;

    toonResultaat({
      heeftPv, contract, investering, bruikbareCap,
      overschot, opslagJaar, opbrengstZelf,
      arbDagen, cycliPerDag, winstPerCyclus, opbrengstArb,
      extraOnbalans, totaal, terugverdientijd,
      stroomprijs, terugleverVergoeding, laadprijs, ontlaadwaarde, rendement,
    });
  }

  /* ------------------------------------------------------------------
     Resultaat tonen
     ------------------------------------------------------------------ */

  function toonResultaat(r) {
    const doel = el("resultaat");

    if (!r.investering || !r.bruikbareCap) {
      doel.innerHTML = '<p class="datum-stempel">Vul de investering en de capaciteit van de batterij in (of kies een batterij uit de lijst) om het resultaat te zien.</p>';
      return;
    }

    const bedragCel = (v) => `<td style="text-align:right;font-weight:700;">${eurFmt.format(v)}</td>`;
    const regels = [];
    if (r.heeftPv) {
      regels.push(`<tr><td>Opslag van eigen zonnestroom (ca. ${numFmt.format(r.opslagJaar)} kWh per jaar)</td>${bedragCel(r.opbrengstZelf)}</tr>`);
    }
    if (r.contract === "dynamisch") {
      regels.push(`<tr><td>Slim laden en ontladen op uurprijzen (${numFmt.format(r.arbDagen)} dagen, ${eur2Fmt.format(r.winstPerCyclus)} per cyclus)</td>${bedragCel(r.opbrengstArb)}</tr>`);
    }
    if (r.extraOnbalans > 0) {
      regels.push(`<tr><td>Opgegeven extra opbrengst (bijv. onbalansmarkt via aggregator)</td>${bedragCel(r.extraOnbalans)}</tr>`);
    }

    let oordeel = "";
    const waarschuwingen = [];

    if (r.terugverdientijd == null) {
      oordeel = "<b>Met deze invoer levert de batterij per saldo niets op.</b> Controleer of het contracttype en de prijzen kloppen.";
    } else {
      const t = r.terugverdientijd;
      const kleur = t <= 8 ? "var(--kleur-groen)" : t <= 15 ? "var(--kleur-accent)" : "var(--kleur-rood)";
      oordeel = `<div style="font-size:2rem;font-weight:800;color:${kleur};">${jaarFmt.format(t)} jaar</div>
        <div class="datum-stempel">terugverdientijd bij een jaarlijkse opbrengst van ${eurFmt.format(r.totaal)}</div>`;
      if (t > 15) waarschuwingen.push("De berekende terugverdientijd is langer dan de levensduur die vaak wordt aangehouden (10 tot 15 jaar). Met deze invoer verdient de batterij zichzelf waarschijnlijk niet terug.");
      else if (t > 10) waarschuwingen.push("De terugverdientijd nadert de verwachte levensduur van de batterij (10 tot 15 jaar). Reken jezelf niet rijk en vergelijk meerdere scenario's.");
    }

    if (r.contract === "vast" && !r.heeftPv) {
      waarschuwingen.push("Zonder zonnepanelen en zonder dynamisch contract kan een thuisbatterij vrijwel niets verdienen: er valt niets op te slaan en geen prijsverschil te benutten.");
    }
    if (r.contract === "dynamisch" && r.opbrengstArb > 0) {
      waarschuwingen.push("De opbrengst uit handel op uurprijzen is een schatting op basis van een vast gemiddeld prijsverschil. Werkelijke spreads wisselen per dag en seizoen, en over stroom die je uit het net laadt betaal je energiebelasting (het bekende knelpunt van dubbele belasting bij terugleveren).");
    }
    if (r.extraOnbalans > 0) {
      waarschuwingen.push("Opbrengsten uit de onbalansmarkt zijn de afgelopen jaren gedaald en bieden geen garantie; TenneT waarschuwt daar expliciet voor.");
    }
    waarschuwingen.push("Tot en met 31 december 2026 geldt de salderingsregeling nog; het voordeel van het opslaan van eigen zonnestroom is tot die datum vrijwel nihil. Deze berekening gaat uit van de situatie vanaf 2027.");
    waarschuwingen.push("Het model rekent niet met batterijdegradatie, rente of stijgende/dalende energieprijzen. Zie de toelichting onderaan voor alle aannames.");

    doel.innerHTML = `
      <div style="text-align:center;padding:10px 0 18px;">${oordeel}</div>
      <div style="overflow-x:auto;">
      <table class="vergelijk-tabel" style="min-width:0;">
        <thead><tr><th>Opbrengst per jaar</th><th style="text-align:right;">Bedrag</th></tr></thead>
        <tbody>
          ${regels.join("") || '<tr><td colspan="2">Geen opbrengsten met deze invoer.</td></tr>'}
          <tr><td style="font-weight:800;">Totaal per jaar</td><td style="font-weight:800;text-align:right;">${eurFmt.format(r.totaal)}</td></tr>
          <tr><td>Saldo na 10 jaar (opbrengst minus investering)</td><td style="text-align:right;font-weight:700;">${eurFmt.format(r.totaal * 10 - r.investering)}</td></tr>
        </tbody>
      </table>
      </div>
      ${waarschuwingen.map((w) => `<div class="waarschuwing-kader" style="margin:12px 0;">${w}</div>`).join("")}
    `;
  }

  /* ------------------------------------------------------------------
     Batterijkeuze en events
     ------------------------------------------------------------------ */

  function vulBatterijKeuze() {
    const sel = el("inpBatterij");
    const opties = batterijen
      .filter((b) => b.capaciteit_kwh && bestePrijs(b))
      .map((b) => `<option value="${b.id}">${b.merk} ${b.model} (${eurFmt.format(bestePrijs(b))})</option>`);
    sel.innerHTML = '<option value="">Zelf invullen…</option>' + opties.join("");
  }

  function kiesBatterij(id) {
    const b = batterijen.find((x) => x.id === id);
    if (!b) return;
    el("inpCapaciteit").value = b.capaciteit_kwh;
    el("inpInvestering").value = bestePrijs(b) || "";
    const hint = el("batterijHint");
    hint.textContent = b.prijs_omvat ? `Let op wat de prijs dekt: ${b.prijs_omvat}. Tel installatiekosten zelf op bij de investering als die er niet in zitten.` : "";
    bereken();
  }

  function togglePvVelden() {
    const heeftPv = el("inpPv").value === "ja";
    el("pvVelden").style.display = heeftPv ? "" : "none";
    bereken();
  }

  function toggleContractVelden() {
    const dyn = el("inpContract").value === "dynamisch";
    el("dynVelden").style.display = dyn ? "" : "none";
    bereken();
  }

  async function init() {
    try {
      const res = await fetch("data/batterijen.json", { cache: "no-cache" });
      const data = await res.json();
      batterijen = data.batterijen || [];
      vulBatterijKeuze();

      const params = new URLSearchParams(location.search);
      const gekozen = params.get("batterij");
      if (gekozen && batterijen.some((b) => b.id === gekozen)) {
        el("inpBatterij").value = gekozen;
        kiesBatterij(gekozen);
      }
    } catch (err) {
      console.error("Batterijen konden niet geladen worden:", err);
    }

    el("inpBatterij").addEventListener("change", (e) => kiesBatterij(e.target.value));
    el("inpPv").addEventListener("change", togglePvVelden);
    el("inpContract").addEventListener("change", toggleContractVelden);
    document.querySelectorAll("#rekenformulier input, #rekenformulier select").forEach((inp) => {
      inp.addEventListener("input", bereken);
    });

    togglePvVelden();
    toggleContractVelden();
    bereken();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
