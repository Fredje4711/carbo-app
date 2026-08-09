# Koolhydraten Scanner v2

Mobiele PWA die een maaltijdfoto via een afgeschermde Vercel-functie laat analyseren en een voorzichtige koolhydraatschatting toont.

## Belangrijkste wijzigingen

- De browser kan geen willekeurige OpenAI-aanvragen meer doorsturen.
- Model, prompt en JSON-schema staan uitsluitend op de server.
- Resultaten bevatten een bereik, beste schatting, porties, zekerheid en aannames.
- Afbeeldingen en audio krijgen type- en groottelimieten.
- Analyse en transcriptie hebben time-outs, veilige foutmeldingen en een eenvoudige server-side snelheidslimiet.
- De lokale credits en zichtbare beheerderscode zijn verwijderd; die boden geen werkelijke bescherming.
- De PWA-cache vermijdt API-verzoeken en vernieuwt navigatie via het netwerk.

## Omgevingsvariabelen in Vercel

Verplicht:

- `OPENAI_API_KEY`: de bestaande geheime OpenAI API-key.

Optioneel:

- `ALLOWED_ORIGINS`: extra toegestane frontend-origins, kommagescheiden. Standaard zijn `https://carbo-app.vercel.app` en `https://fredje4711.github.io` toegestaan.
- `OPENAI_VISION_MODEL`: standaard `gpt-4o-mini`.
- `OPENAI_TRANSCRIPTION_MODEL`: standaard `gpt-4o-mini-transcribe`.

Voeg voor een Vercel Preview Deployment de exacte preview-origin tijdelijk toe aan `ALLOWED_ORIGINS`.

## Beveiliging en kosten

De ingebouwde snelheidslimiet is een eerste bescherming per serverless instantie. Configureer voor productie daarnaast een duurzame Vercel Firewall-rate-limit of een gedeelde datastore. Behoud ook de harde maandelijkse OpenAI-uitgavenlimiet.

De app aanvaardt aan de analysezijde uitsluitend:

```json
{
  "image": "data:image/jpeg;base64,...",
  "description": "optionele beschrijving, maximaal 800 tekens"
}
```

## Lokale controles

```powershell
npm install
npm run check
npm test
```

Een echte OpenAI-aanvraag wordt niet door de automatische tests uitgevoerd en vereist een geldig, veilig geconfigureerd `OPENAI_API_KEY`.

## Medische begrenzing

De toepassing is educatief. Een foto kan portiegrootte, receptuur en verborgen ingrediënten niet betrouwbaar bepalen. Resultaten mogen niet als enige basis voor zelfstandige insulinedosering worden gebruikt.

