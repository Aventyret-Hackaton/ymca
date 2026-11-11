# ymca

Skriv meddelanden med kroppen: telefonens kamera tolkar kroppsformer som bokstäver.

En webbapp som körs i telefonens webbläsare. Kroppens punkter hittas med
[MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
direkt i webbläsaren, och jämförs sedan med poser som vi själva har spelat in.

## Kom igång

```bash
npm install
npm run dev
```

Öppna adressen som skrivs ut. På datorn fungerar kameran på `localhost`.

### Testa på telefonen

Kameran kräver HTTPS på allt utom `localhost`:

```bash
npm run dev:phone
```

Öppna `Network`-adressen (`https://192.168.…`) på en telefon i samma nätverk och
godkänn varningen om det självsignerade certifikatet.

## Två lägen

- **Användarläge** (vanliga adressen): ingen inspelning och inga knappar efter
  start. Användaren godkänner villkoren med ett tryck och styr sedan med rösten:
  *starta* börjar skriva, *stopp* pausar och *rensa* tömmer meddelandet. Efter
  skicka-posen krävs ett nytt *starta*.
- **Inspelningsläge** (lägg till `?setup` i adressen, till exempel
  `https://192.168.…:5173/?setup`): för oss i teamet. Här spelas poser in, och
  skrivandet är alltid på utan röst.

Röststyrningen använder webbläsarens inbyggda taligenkänning (`src/voice.ts`).
Den finns i Chrome och Safari men inte i Firefox, och kräver mikrofon och
internet eftersom ljudet tolkas hos Google respektive Apple.

## Så fungerar det

1. **Spela in poser.** Under fliken *Spela in poser* väljer man en bokstav och
   trycker på Spela in. Efter fem sekunders nedräkning sparas posen som en mall.
   Spela in varje bokstav några gånger, gärna med olika personer.
2. **Skriv.** Under fliken *Skriv* jämförs den aktuella posen med alla mallar.
   Håller man en igenkänd pose i 1,5 sekunder läggs bokstaven till, läses upp
   och telefonen vibrerar. Posen måste släppas innan samma bokstav kan komma igen.
3. **Kontrollposer.** `MELLANSLAG` (␣), `SUDDA` (⌫) och `SKICKA` (✉) spelas in
   som vilka poser som helst, så vi bestämmer själva hur de ser ut.

Bokstäverna ska vara rättvända för kameran. Den som poserar gör dem alltså
spegelvända från sitt eget håll, och kamerabilden visas ospeglad.

### Dela mallar i teamet

Mallar sparas i webbläsaren på den enhet där de spelades in. `public/templates.json`
är den delade uppsättningen, som används av alla som inte har egna mallar sparade.

- **Spara till repot** (syns bara mot utvecklingsservern): skriver enhetens
  mallar direkt till `public/templates.json` på datorn som kör `npm run dev`
  eller `npm run dev:phone`. Checka sedan in och pusha filen.
- **Exportera mallar:** laddar ner samma fil till enheten, om du hellre flyttar
  den för hand.

Spara till repot ersätter hela filen med enhetens mallar. Hämta därför senaste
`main` och börja från den delade uppsättningen innan du spelar in fler, så att
du inte skriver över någon annans poser.

## Koden

| Fil | Innehåll |
|---|---|
| `src/pose.ts` | Startar kameran och MediaPipe-modellen |
| `src/classify.ts` | Normaliserar posen och hittar närmaste mall. Trösklarna `MAX_DISTANCE` och `MIN_MARGIN` justeras här |
| `src/templates.ts` | Sparar, exporterar och importerar mallar. Listan över bokstäver och kontrollposer |
| `src/voice.ts` | Röstkommandon via webbläsarens taligenkänning. Kommandoorden står i `COMMAND_WORDS` |
| `src/main.ts` | Gränssnitt, ritning, håll-för-att-bekräfta och inspelning |

Statusraden under bilden visar avståndet till närmaste och näst närmaste
bokstav. Använd siffrorna för att justera trösklarna.

## Kvar att göra

- Skicka till Slack: `sendMessage()` i `src/main.ts` är en tom krok. Lägg
  webhook-adressen i en serverfunktion, inte i klienten.
- SMS öppnas i dag via en `sms:`-länk som kräver ett tryck på skärmen.
- Bestämma alternativ till de svåraste bokstäverna (golvposer, U och V).
- Lägga upp appen på en HTTPS-adress.
