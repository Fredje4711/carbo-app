# Koolhydraten Scanner 3.0.1

Mobiele PWA met Vercel-functies voor een voorzichtige koolhydraatschatting en Nederlandse spraakomzetting. GitHub blijft de bron; Vercel blijft de hosting. Begin bij [START-HIER.md](START-HIER.md). Zie ook [de correctie na uw gebruikerstest](docs/CORRECTIE-COMPACT.md).

## Verbeteringen

- Compacte opzet gebaseerd op het origineel, knoppen vanaf 44 px en een foto van 100 px hoog die u kunt vergroten. De analyseknop staat in het formulier.
- Het resultaat vervangt het formulier. Extra uitleg is uitklapbaar. Geschiedenis en installatie/privacy staan onder Meer & instellingen.
- Eén actieve bewerking tegelijk, annulering en bescherming tegen late antwoorden en overlappende fotokeuzes.
- Fotoverwerking tot 40 MB invoer, lokaal verkleinen tot 1280 px, browserondersteunde HEIC-conversie met duidelijke terugvalmelding. Preview gebruikt de verkleinde afbeelding.
- Opnameteller tot 45 seconden, microfoon vrijgeven, annuleren en tijdslimiet voor tekstomzetting.
- Offline-indicatie; bij fouten blijven foto en tekst staan. Resultaatcontrole op server én client; totalen uit onderdelen afgeleid. Geen herkende maaltijd verbruikt geen scan en toont geen nulgramtotaal.
- Portie verduidelijken voert een nieuwe analyse uit met aangepaste beschrijving.
- Optionele IndexedDB-sessieopslag, maximaal 24 uur herstelbaar; maximaal tien resultaten zonder foto/opname. Verlopen sessies worden bij een volgende start verwijderd. Opslaan staat standaard uit.
- Installatiehulp voor iPhone/Android en ondersteunde browserinstallatieprompt; updates na expliciete actie.
- Bestaande feedbackcode activeert onbeperkt gratis scans. Bestaande resterende scantellers blijven behouden. Er is geen automatische migratie van eerder uitgegeven blokken van 100 naar onbeperkt: voer de code eenmaal opnieuw in.

## Starten en testen

```powershell
npm ci
npm run check
npm test
npm run dev
```

Zonder werkende npm-launcher zijn `node tools/check.mjs`, `node --test test/*.test.js` en `node tools/dev-server.mjs` bruikbaar zodra dependencies aanwezig zijn. Op deze laptop zijn de bestaande dependencies naar de nieuwe werkmap gekopieerd; de lockfile blijft leidend voor nieuwe installaties.

De standaard ontwikkelserver op poort 4174 stuurt de werkelijk gekozen foto en audio door naar de bestaande Vercel-service; een lokale API-sleutel is niet nodig. Met `--local-api` worden de gewijzigde lokale serverfuncties gebruikt en is `OPENAI_API_KEY` wel nodig. De server luistert uitsluitend op 127.0.0.1. De vroegere demo met vaste resultaten is verwijderd.

## Vercel-configuratie

De bestaande configuratie en endpoints blijven behouden:

- `POST /api/proxy`: JSON met `image` als JPEG/PNG/WebP-data-URL en optionele `description` (max. 800 tekens).
- `POST /api/whisper`: multipart audio van max. 5 MB.
- `OPENAI_API_KEY` is verplicht en blijft uitsluitend in de serveromgeving.
- `OPENAI_VISION_MODEL` standaard `gpt-4o-mini`; `OPENAI_TRANSCRIPTION_MODEL` standaard `gpt-4o-mini-transcribe`.
- `ALLOWED_ORIGINS` kan extra exacte origins bevatten. Productie en de bestaande vertrouwde Vercel-previewhosts blijven ondersteund.

`store: false` voorkomt dat de gegenereerde Responses-API-respons voor later ophalen wordt opgeslagen. Dat is geen belofte van volledige afwezigheid van bewaartermijnen bij de verwerker. Zie [OpenAI API-documentatie](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) en [gegevensbeleid](https://platform.openai.com/docs/guides/your-data).

## Feedbackbeloning en kostenbegrenzing

De scanteller en de bestaande, reeds publiek verspreide feedbackcode zijn bewust een lokale feedbackbeloning. Ze zijn geen authenticatie of kostenbeveiliging. Een nieuw toestel of het wissen van sitegegevens kan de teller opnieuw initialiseren. De code staat nog in de client, zodat reeds verstrekte codes werken zonder nieuwe serverconfiguratie. Onbeperkt betekent geen uitputtend lokaal scantegoed; tijdelijke serverlimieten gelden voor iedereen.

De bestaande limieten (10 analyses en 15 transcripties per 10 minuten per IP en serverinstantie) blijven actief. Voor een gedeelde limiet over alle Vercel-instanties is ondersteuning toegevoegd voor:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ANALYSIS_DAILY_LIMIT` en `TRANSCRIPTION_DAILY_LIMIT` (standaard elk 1000 aanvragen per vast venster van 24 uur vanaf de eerste aanvraag).

De Redis-call voert atomaire telling uit, bewaart een HMAC van het IP in plaats van het IP zelf en blokkeert aanvragen bij een storing in de geconfigureerde limiter. Het dagmaximum geldt voor de hele app, per soort aanvraag. Zonder Redis-configuratie werkt de bestaande limiter per instantie; er is dan geen gedeelde daglimiet. Deze optionele koppeling is nog niet op uw Vercel-account geactiveerd. Zie [Upstash REST-documentatie](https://upstash.com/docs/redis/features/restapi). Deze limieten begrenzen aantallen, geen exact eurobedrag.

## Updates en uitrollen

Het manifest blijft dezelfde identiteit en start-URL gebruiken. Verhoog bij wijzigingen alle `v=...`-assetverwijzingen in index.html, script.js en service-worker.js samen met de cachenaam. Nieuwe workers wachten op Nieuwe versie openen of het sluiten van de oude appvensters. Op de oude versie 2 ontbreekt de updateknop; sluit die app volledig en open opnieuw om versie 3 te activeren.

Testcode, hulpmiddelen en voorbeeldbestanden worden via `.vercelignore` uitgesloten van publicatie. Er zijn geen wijzigingen naar GitHub gepusht of naar productie uitgerold tijdens deze lokale verbeteringsronde.

Zie [mobiele acceptatiecontrole](docs/MOBIELE-CONTROLE.md) voor de nog vereiste iPhone-/Androidpraktijktests.
