# Koolhydraten Scanner — projectmap

Dit is de volledige werkmap voor versie 3.0.0.

- GitHub: https://github.com/Fredje4711/carbo-app
- Online app (bestaande gepubliceerde versie): https://carbo-app.vercel.app
- Werkbranch: `codex/mobile-improvements`
- Basis: `dd4f2b9` van 9 augustus 2026. De oorspronkelijke map is behouden.

## Lokaal openen

Open een terminal in deze map en voer uit:

```powershell
node tools/dev-server.mjs --demo
```

Open vervolgens http://127.0.0.1:4174. Deze duidelijk gemarkeerde testversie gebruikt vaste voorbeeldresultaten en verstuurt niets naar OpenAI. Gebruik een willekeurige testafbeelding, bijvoorbeeld `icon-192.png`. In de beschrijving kunt u `test:geen`, `test:fout` en `test:traag` invullen voor bijzondere situaties. Deze demo is geen controle van de voedingskundige nauwkeurigheid.

Voor de echte lokale server: `node tools/dev-server.mjs`. Deze gebruikt poort 4173 en vereist een serveromgevingsvariabele `OPENAI_API_KEY` voor echte analyses. Open de app via een server, niet door dubbelklikken op index.html.

## Controleren

```powershell
node tools/check.mjs
node --test test/*.test.js
```

Deze opdrachten werken ook wanneer de lokale npm-launcher verkeerd geconfigureerd is. Bij een nieuwe installatie zijn de dependencies uit `package-lock.json` nodig (`npm ci`).

## Publiceren

De app blijft bij Vercel. Het project hoeft niet opnieuw aangemaakt te worden. De wijzigingen staan lokaal op een aparte branch; ze zijn nog niet naar GitHub gepusht of in productie gepubliceerd. Eerst de mobiele acceptatiecontrole in `docs/MOBIELE-CONTROLE.md` uitvoeren, dan een Vercel-preview via de bestaande repository en ten slotte de productiebranch bijwerken.

De geheime OpenAI-sleutel blijft in Vercel; er is geen kopie van die sleutel nodig in deze map. De bestaande feedbackcode blijft geldig en geeft vanaf deze versie onbeperkte gratis scans op het betreffende toestel.

Zie `README.md` voor implementatie en `docs/MOBIELE-CONTROLE.md` voor de resterende fysieke toestelcontroles.
