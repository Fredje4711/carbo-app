# Koolhydraten Scanner — start hier

De actieve werkmap is `Koolhydraten scanner 5`. De compacte versie is 3.2.0.

## Openen met echte fotoanalyse

```powershell
node tools/dev-server.mjs
```

Open **http://127.0.0.1:4174/?test=1** op deze laptop. De geselecteerde foto en eventuele spraak gaan via de lokale server naar de bestaande Vercel-service op https://carbo-app.vercel.app. Er is geen API-sleutel op de laptop nodig. Dezelfde verwerking en eventuele serverkosten als in de online app zijn van toepassing.

De eerdere demo met vaste pastaresultaten is verwijderd. `--demo` wordt geweigerd; er is geen terugval naar voorbeeldresultaten bij fouten.

## Compacte opzet

- Foto kiezen, extra informatie en analyseren staan samen in één compact formulier.
- De foto vult de breedte zonder uitsnijden. Het resultaat staat onder hetzelfde formulier; na analyse scrolt de app ernaartoe.
- Pas tekst of ingesproken porties aan en kies Opnieuw analyseren. Dezelfde foto blijft geselecteerd.
- Voedingsmiddelen en grammen staan kort onder elkaar. Toelichting is uitklapbaar.
- Geschiedenis en privacy staan onder Meer & instellingen. Installatie-uitleg staat uitsluitend vóór toegang tot de app.
- De bestaande feedbackcode geeft onbeperkt gratis scans.

## Controleren en publiceren

```powershell
node tools/check.mjs
node --test test/*.test.js
```

De wijzigingen staan op `codex/mobile-improvements`. Productie op Vercel is nog niet vervangen. De lokale versie gebruikt de bestaande productie-API; voor een test van de gewijzigde serverfuncties gebruikt u een Vercel-preview of `node tools/dev-server.mjs --local-api` met `OPENAI_API_KEY` in de serveromgeving.

De oorspronkelijke versie blijft in Git beschikbaar onder commit `dd4f2b9`.

## Installatie vanuit e-mail

De gewone link (lokaal http://127.0.0.1:4174/) toont de installatiepagina. Op computer vraagt die om de e-mail op de gsm te openen. Op iPhone/Android verschijnt de passende uitleg. Gebruik de bestaande icon-192.png en icon-512.png via manifest en Apple-touch-icon. Vanuit het geïnstalleerde pictogram opent de scanner zonder installatie-uitleg. De oude installatie_scanner.html verwijst naar dezelfde toegang.

De tijdelijke testtoegang ?test=1 werkt uitsluitend op localhost/127.0.0.1 en wordt niet aangeboden aan gewone gebruikers. Verwijderen kan door LOCAL_TEST_ENABLED in lib/installation.js op false te zetten, met een nieuwe asset- en serviceworkerversie. Dit is een gebruiksstroom, geen authenticatie of serverbeveiliging.

De installatie-instructies zijn nagekeken bij [Apple](https://support.apple.com/guide/iphone/iphea86e5236/ios) en [Google](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=nl). De definitieve installatie, het pictogram en openen vanuit het beginscherm moeten nog op een echte iPhone en Android worden gecontroleerd via een HTTPS-preview. De lokale laptoptest gebruikt echte Vercel-analyse, maar biedt geen gsm-installatietest.
