> Historisch verslag van de technische tests van versie 3.0.0. De demo is inmiddels verwijderd; zie CORRECTIE-COMPACT.md voor de werkende compacte versie 3.0.1.

# Mobiele acceptatiecontrole

## Automatisch gecontroleerd

- Serverinvoer, optionele beschrijving, onvolledige AI-uitvoer, ongeldige bereiken en herberekende totalen.
- Geen maaltijd: geen zichtbaar nulgramtotaal, geen afboeking van een scan.
- Wissen tijdens opnemen, wachten op microfoontoestemming en tekstomzetting.
- Geen analyse tijdens opname/tekstomzetting; annuleren negeert late antwoorden.
- Laatste fotokeuze wint; wissen tijdens verkleinen haalt de foto niet terug.
- Bewaren is optioneel; geschiedenis bevat maximaal tien resultaten zonder foto/audio.
- Herstelsessies ouder dan 24 uur worden geweigerd.
- Bestaande scantellers en activering van onbeperkt gratis scans.
- Serviceworker beschermt eigen cache, onderschept geen API en wacht bij updates.
- Limiet per instantie en optionele gedeelde Redis-limiet.

De frontendtests gebruiken een gesimuleerde DOM, microfoon, klok waar nodig en netwerkaanvragen. Ze testen de echte appfuncties maar vervangen geen fysieke toesteltest.

## Browsercontrole

Uitgevoerd op 22 september 2026 in de lokale browser met gesimuleerde gsm-schermmaten: fotokeuze/verkleining, resultaat en bereik, portie verduidelijken, geen maaltijd zonder afboeking, serverfout met behoud van invoer, annuleren van een trage aanvraag, sessieherstel na herladen, upgrade van cache v8 naar v9 met sessiebehoud, openen van de geschiedenis en activeren van onbeperkte scans. Geen fysieke camera/microfoon of echte AI-analyse gebruikt.

De lokale demo gebruikt vaste resultaten en geen OpenAI. Controleer bij wijzigingen met de browser:

- Breedtes 320, 390 en 430 pixels, ook met lange tekst.
- Foto kiezen, voorbeeld vergroten/sluiten, resultaat bekijken, portie verduidelijken.
- `test:geen`: totalen verborgen en scans gelijk.
- `test:fout`: foto/tekst blijven; opnieuw proberen is bereikbaar.
- `test:traag`: annuleren bewaart invoer en toont later geen resultaat.
- Optioneel bewaren inschakelen, herladen, herstellen en geschiedenis openen.
- Code invoeren: Onbeperkt blijft staan na analyse en herladen.
- Wisselen naar een nieuwe serviceworkerversie zonder verlies van een bewaarde sessie.

## Nog fysiek uit te voeren vóór productie

Deze controles mogen niet als uitgevoerd worden voorgesteld zonder echte toestellen:

| Toestel | Controle | Verwachting |
|---|---|---|
| iPhone / Safari | Foto maken, bibliotheek, HEIC | Ondersteund formaat wordt omgezet; anders duidelijke JPEG-instructie |
| Android / Chrome | Achtercamera en foto kiezen | Volledige foto, juiste oriëntatie, compact voorbeeld |
| Beide | Opname toestaan/weigeren | Werkende opname of bruikbare uitleg en typen mogelijk |
| Beide | Opname stoppen/wissen/achtergrond | Microfoon gaat uit; geannuleerde tekst komt niet terug |
| Beide | Bellen/vergrendelen/appwissel | Geen vastgelopen bediening; voorbereide maaltijd herstelbaar bij ingeschakelde opslag |
| Beide | Vliegtuigmodus/slecht netwerk | Offline-uitleg, invoer behouden, annuleren en opnieuw proberen |
| Beide | Beginscherminstallatie | Eigen pictogram, zelfstandig venster, juiste onderrand |
| Beide | Toetsenbord / grote systeemtekst / schermlezer | Knoppen en invoer bereikbaar, geen horizontale overloop |
| Beide | Nieuwe versie | Melding, bewuste update, bewaarde sessie herstelbaar |

Een HTTP-preview op het LAN is niet voldoende voor een betrouwbare camera-/microfoon-/installatietest. Gebruik hiervoor een HTTPS Vercel-preview van deze branch.

## Grenzen

- Een geannuleerde aanvraag kan al op de server/OpenAI verwerkt worden. De browser negeert het late antwoord; dit garandeert niet dat er geen serverkosten zijn.
- Lokale opslag kan door de browser of de gebruiker gewist worden. Geen synchronisatie tussen gsm en laptop.
- HEIC-conversie gebruikt de mogelijkheden van het toestel; er is geen zware externe converter ingebouwd.
- Een AI-fotoschatting is geen meting. Test met bekende porties voordat u inhoudelijke nauwkeurigheid beoordeelt.
- De Redis-aansluiting is geïmplementeerd en gesimuleerd getest, maar is pas actief wanneer de twee Redis-variabelen in Vercel geconfigureerd zijn.
