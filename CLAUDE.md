# Zonnepaneelmaatje.nl

Statische vergelijkingssite voor zonnepanelen en omvormers (zustersite van
Batterijmaatje.nl). Geen buildstap: HTML + vanilla JS die JSON laadt uit
`data/`. Ontwikkeling gebeurt op deze repo/branch; productie staat in de
repo `AI-KRook/Zonnemaatje` (branch `main`, live via GitHub Pages op
https://ai-krook.github.io/Zonnemaatje/, met `gh-pages` als fallback zonder
CNAME).

## Vaste werkwijze bij analyses

Als Kaj om een analyse, review of check van de site vraagt, voer dan ALTIJD
beide sporen uit:

1. **Persona-analyse**: loop de site door als een 30-jarige (mobiel, weinig
   tijd, doet alles zelf), een 60-jarige (wil zekerheid, geen jargon) en een
   journalist (controleert claims, bronnen, consistentie en actualiteit).
2. **Heuristische evaluatie** (Nielsen), met in elk geval:
   - **Labelconsistentie/parallelisme**: menu-items, knoppen en kolomkoppen
     moeten onderling van dezelfde soort zijn (allemaal producten of allemaal
     acties) en hetzelfde ding moet overal hetzelfde heten.
   - **Cognitieve walkthrough**: per kerntaak nagaan of een nieuwe bezoeker
     in één keer ziet waar hij moet klikken.
   - **Tekst-gedrag-consistentie**: elke plek benoemen waar tekst en gedrag
     na recente wijzigingen niet meer bij elkaar passen (bijv. "richtprijs"
     waar een winkelprijs staat, of beloften op over-ons die de site niet
     waarmaakt).
   - **Tekstgrootte-check (WCAG 1.4.4)**: alle paginatypen met Playwright
     doormeten op 150% en 200% tekstgrootte (root font-size 24px en 32px),
     op desktop (1280px) en telefoon (390px): geen horizontale overloop,
     niets buiten beeld. Zie scratchpad-script test-tekstgrootte.mjs als
     voorbeeld. Basis blijft 1rem (nooit vaste px op body); grids krimpbaar
     houden met minmax(0, 1fr) en flex-rijen laten omklappen.

Voer gevonden verbeterpunten direct door (na testen) en rapporteer per
persona/heuristiek wat goed stond, wat is aangepast en wat bewust is
gelaten.

## Overige vaste regels

- **Links eerst verifiëren, dan plaatsen**: nieuwe winkellinks pas
  publiceren nadat de prijscheck-workflow (`update-prijzen.yml`) ze op een
  GitHub-runner heeft bereikt; 404/403/fetch-fouten verwijderen.
  (Lokaal is extern verkeer geblokkeerd door de proxy.)
- **Prijzen**: `bestePrijs()` in alle scripts gelijk houden (goedkoopste
  aanbieding, bij gelijke prijs wint de aanbieding met controledatum,
  terugval op richtprijs).
- **Testen**: wijzigingen lokaal controleren met playwright-core
  (chromium op `/opt/pw-browsers/chromium`, server: `python3 -m http.server`).
- **Cache**: bij wijziging van een JS/CSS-bestand de `?v=`-versie in de
  betreffende HTML ophogen.
- **Deploy**: dev-branch pushen, daarna de werkboom (excl. `.git`, `.claude`
  en dit bestand) via tar syncen naar de Zonnemaatje-kloon, committen en
  pushen naar `main` (deploy start automatisch) en `gh-pages` (zonder
  CNAME). Dit bestand (CLAUDE.md) NIET meesyncen naar de productie-repo.
- **Schrijfstijl**: geen gedachtestreepjes in Nederlandse teksten;
  bronvermelding bij normen, onderzoek en niet-algemene claims.
