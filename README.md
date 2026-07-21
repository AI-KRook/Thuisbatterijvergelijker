# ☀️ Zonnepaneelmaatje.nl

Een gebruiksvriendelijke, statische vergelijkingssite voor zonnepanelen op de Nederlandse markt. Gebouwd voor GitHub Pages: geen build-stap, geen server nodig. De zustersite van [Batterijmaatje.nl](https://batterijmaatje.nl/) (thuisbatterijen), met dezelfde opzet en huisstijl.

## Wat kan de site?

- **Vergelijken** van populaire zonnepanelen op prijs per paneel, prijs per wattpiek, rendement, vermogen en garanties.
- **Filteren** op celtype (TOPCon, HJT, back-contact), vermogen, glas-glas of glas-folie, merk, full black, bifaciaal en lange productgarantie.
- **Zeker-score** (0 tot 6 punten): transparante degelijkheidsscore op basis van productgarantie, vermogensbehoud na 25 jaar en glas-glas uitvoering.
- **Sterrenscore "opbrengst per m² dak"** op basis van het rendement, voor wie weinig dakruimte heeft.
- **Kaart- en tabelweergave**, plus zij-aan-zij vergelijken van maximaal 3 panelen.
- **Rekenmodule** (`rekenmodule.html`): berekent per paneel en per situatie (dakligging, schaduw, verbruik, met en zonder saldering) de jaaropbrengst, besparing en terugverdientijd, met instelbare en gedocumenteerde aannames.
- **Keuzehulp** (`advies.html`): adviseert op basis van verbruik, dak en wensen het aantal wattpiek en de drie best passende panelen.
- **Uitlegpagina's** over celtypen, glas-glas, garanties en de actuele regels: einde salderingsregeling per 2027, 0% btw en terugleverkosten, met bronvermelding.
- **Detailpagina per paneel** (`paneel/<id>.html`), overzichtspagina's (klein dak, glas-glas) en "X vs Y"-vergelijkingen, allemaal gegenereerd uit de data.

## Structuur

```
index.html                      De vergelijker
rekenmodule.html                Opbrengst en terugverdientijd
advies.html                     Keuzehulp
uitleg.html                     Uitleg en woordenlijst
regelgeving.html                Regels en subsidies
paneel/<id>.html                Detailpagina per paneel (gegenereerd)
vergelijk/<a>-vs-<b>.html       Vergelijkingspagina's (gegenereerd)
beste-*.html                    Overzichtspagina's (gegenereerd)
assets/style.css                Vormgeving
assets/app.js                   Filter-, sorteer- en renderlogica
assets/rekenmodule.js           Rekenlogica opbrengst en terugverdientijd
assets/advies.js                Advieslogica keuzehulp
data/panelen.json               Alle paneelgegevens en richtprijzen
scripts/genereer-paneelpaginas.mjs   Genereert paneel-, overzichts- en vs-pagina's + sitemap
scripts/update-prices.mjs       Prijsupdate-script (Node.js), voor gekoppelde winkels
.github/workflows/
  update-prijzen.yml            Dagelijkse GitHub Action die prijzen ververst
  deploy-pages.yml              Publicatie naar GitHub Pages
```

## Live zetten (eigen repository aanbevolen)

Deze code is ontwikkeld op een branch van de Thuisbatterijvergelijker-repository. Eén repository kan maar één GitHub Pages-site hosten, dus voor zonnepaneelmaatje.nl is een eigen repository nodig:

1. Maak een nieuwe repository aan (bijvoorbeeld `Zonnepaneelmaatje`).
2. Push deze branch daarheen als `main`:
   ```bash
   git clone -b claude/zonnepaneelmaatje-website-cl6974 <url-van-deze-repo> zonnepaneelmaatje
   cd zonnepaneelmaatje
   git remote set-url origin <url-van-de-nieuwe-repo>
   git push -u origin HEAD:main
   ```
3. Ga in de nieuwe repository naar **Settings → Pages** en kies bij **Build and deployment** de bron **GitHub Actions**.
4. Na de eerste run van de workflow "Publiceren naar GitHub Pages" staat de site live. Koppel het domein `zonnepaneelmaatje.nl` via **Settings → Pages → Custom domain** (het `CNAME`-bestand staat al klaar) en verwijs bij je domeinregistrar de DNS naar GitHub Pages.

De deploy-workflow staat bewust alleen op `main` + handmatig starten, zodat er vanuit deze branch nooit per ongeluk over batterijmaatje.nl heen wordt gepubliceerd.

## Prijzen en data bijwerken

Alle inhoud staat in `data/panelen.json`. Voeg een object toe aan de `panelen`-array met dezelfde velden als de bestaande items en draai daarna:

```bash
node scripts/genereer-paneelpaginas.mjs
```

Dat herbouwt de paneelpagina's, de overzichtspagina's, de vs-pagina's en `sitemap.xml`.

De prijzen zijn nu indicatieve richtprijzen (`richtprijs_eur`). Wil je automatische prijscontrole per winkel, voeg dan per paneel `aanbiedingen` toe met winkel-URL's (zelfde formaat als bij Batterijmaatje); de dagelijkse workflow `update-prijzen.yml` leest die pagina's dan uit via structured data en werkt de prijzen bij.

## Disclaimer

Prijzen, specificaties en regelgeving veranderen regelmatig. De prijs en voorwaarden op de website van de aanbieder zijn altijd leidend; specificaties komen uit fabrikantendatasheets en moeten vóór aankoop gecontroleerd worden.
