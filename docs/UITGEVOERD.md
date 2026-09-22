> Dit verslag betreft de eerdere versie 3.0.0. Die oplevering is na gebruikersfeedback gecorrigeerd; zie CORRECTIE-COMPACT.md en START-HIER.md.

# Uitgevoerde verbetering — 22 september 2026

## Werkmap en versie

De volledige Git-geschiedenis van `Fredje4711/carbo-app` is overgenomen in `Koolhydraten scanner 5`. Basiscommit: `dd4f2b9`. De oorspronkelijke projectmap is behouden. De wijzigingen staan op `codex/mobile-improvements`, versie 3.0.0, assetcache v10.

## Opgeleverd

- Mobiele bediening met grote knoppen, compacte vergrootbare foto, vaste hoofdactie en leesbare hulptekst.
- Annulering en duidelijke toestanden voor fotoverwerking, opname, transcriptie en analyse.
- Geen late tekst of foto na wissen; laatste fotokeuze wint; geen analyse tijdens inspreken.
- Tijdslimieten, offline-uitleg en herstelbare fouten met behoud van foto/tekst.
- Optionele sessieopslag en maximaal tien resultaten op het toestel, met wisfuncties.
- Bereiken en totalen gevalideerd, totalen afgeleid uit onderdelen, geen nulgramresultaat en geen afboeking bij niet-herkende maaltijd.
- Portie verduidelijken, installatiehulp, expliciete app-update en sessiebehoud tijdens update. Update geblokkeerd als opslaan mislukt.
- Onbeperkt gratis scans na feedbackcode, ook na herladen. Bestaande code blijft geldig.
- Optionele gedeelde serverlimiet, gescheiden van de lokale feedbackbeloning.
- Lokale server, duidelijk gemarkeerde demo, tests en documentatie voor voortzetting van het project.

## Verificatie

- Syntax, elementverwijzingen en versieconsistentie: geslaagd.
- 36 automatische tests: geslaagd.
- Git whitespace-controle: geslaagd.
- Lokale browser: fotokeuze, normale/lege/foutieve analyse, annuleren en late respons, portie verduidelijken, sessieherstel, historie en feedbackcode gecontroleerd.
- Schermbreedtes 320 en 390 pixels: geen horizontale overloop; primaire bedieningsknoppen minimaal 48 pixels hoog. Dit vervangt geen fysieke toegankelijkheidscontrole.
- App-upgrade in de browser: wachtmelding, bewust bijwerken en herstel van de sessie gecontroleerd.

## Nog niet uitgevoerd

- Geen publicatie of push naar GitHub/Vercel; productie blijft de bestaande werkende versie.
- Geen echte fotoanalyse met de API-sleutel en geen opname van de gebruiker. De browsertests gebruiken de lokale demo.
- Geen fysieke iPhone-/Androidtest. Zie `MOBIELE-CONTROLE.md`.
- Geen Redis-account aangemaakt of Redis-variabelen in Vercel ingesteld. Zonder die optionele instelling blijft de bestaande limiet per serverinstantie actief.

Voor de volgende stap zijn een Vercel-preview en de fysieke toestelcontrole aangewezen. Het bestaande Vercel-project en webadres blijven behouden.
