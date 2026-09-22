# Koolhydraten Scanner — start hier

De actieve werkmap is `Koolhydraten scanner 5`. De compacte versie is 3.0.1.

## Openen met echte fotoanalyse

```powershell
node tools/dev-server.mjs
```

Open **http://127.0.0.1:4174** op deze laptop. De geselecteerde foto en eventuele spraak gaan via de lokale server naar de bestaande Vercel-service op https://carbo-app.vercel.app. Er is geen API-sleutel op de laptop nodig. Dezelfde verwerking en eventuele serverkosten als in de online app zijn van toepassing.

De eerdere demo met vaste pastaresultaten is verwijderd. `--demo` wordt geweigerd; er is geen terugval naar voorbeeldresultaten bij fouten.

## Compacte opzet

- Foto kiezen, extra informatie en analyseren staan samen in één compact formulier.
- Het resultaat vervangt het formulier; u ziet geen lange dubbele pagina.
- Voedingsmiddelen en grammen staan kort onder elkaar. Toelichting is uitklapbaar.
- Geschiedenis, installatie en privacy staan onder Meer & instellingen.
- De bestaande feedbackcode geeft onbeperkt gratis scans.

## Controleren en publiceren

```powershell
node tools/check.mjs
node --test test/*.test.js
```

De wijzigingen staan op `codex/mobile-improvements`. Productie op Vercel is nog niet vervangen. De lokale versie gebruikt de bestaande productie-API; voor een test van de gewijzigde serverfuncties gebruikt u een Vercel-preview of `node tools/dev-server.mjs --local-api` met `OPENAI_API_KEY` in de serveromgeving.

De oorspronkelijke versie blijft in Git beschikbaar onder commit `dd4f2b9`.
