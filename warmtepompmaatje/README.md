# Warmtepompmaatje.nl

Onafhankelijke vergelijkingssite voor warmtepompen (hybride en all-electric) op de Nederlandse markt. Zustersite van Zonnepaneelmaatje en Batterijmaatje.nl.

Statische site zonder buildstap: HTML + vanilla JavaScript dat `data/warmtepompen.json` laadt. Ontwikkeld in de map `warmtepompmaatje/` van de dev-repo; productie draait via GitHub Pages.

- `index.html` + `assets/app.js`: vergelijker (kaarten, tabel, vergelijk-modal, Koppel-score)
- `advies.html` + `assets/advies.js`: keuzehulp (hybride of all-electric, besparing, subsidie)
- `rekenmodule.html` + `assets/rekenmodule.js`: besparing en terugverdientijd per pomp
- `uitleg.html`, `subsidie.html`: uitleg en ISDE
- `data/warmtepompen.json`: alle pompen met specificaties, prijzen en koppelingsinfo
