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

Varje person har en egen fil, `templates/<namn>.json`, så att ingen ändrar i
någon annans fil och vi slipper konflikter. Appen matchar mot allas mallar
tillsammans.

1. Fyll i ditt namn under *Spela in poser*. Det blir filnamnet (`Åsa K` blir
   `asa-k`).
2. Spela in poser. De sparas i webbläsaren på enheten.
3. Tryck på **Spara till repot** (syns bara mot utvecklingsservern). Dina mallar
   skrivs till `templates/<namn>.json` på datorn som kör `npm run dev` eller
   `npm run dev:phone`.
4. Checka in och pusha din fil.

Siffrorna på bokstavsknapparna visar *egna + andras* mallar. Ta bort, importera
och exportera gäller bara dina egna. En annan persons mall ändras i den
personens fil.

Öppnar du appen på en ny enhet eller adress och fyller i samma namn, fortsätter
du från din fil i repot.

## Koden

| Fil | Innehåll |
|---|---|
| `src/pose.ts` | Startar kameran och MediaPipe-modellen |
| `src/classify.ts` | Normaliserar posen och hittar närmaste mall. Trösklarna `MAX_DISTANCE` och `MIN_MARGIN` justeras här |
| `src/templates.ts` | Hämtar allas mallar, sparar de egna. Listan över bokstäver och kontrollposer |
| `vite.config.ts` | Slår ihop `templates/*.json` till en fil för appen och tar emot Spara till repot |
| `src/main.ts` | Gränssnitt, ritning, håll-för-att-bekräfta och inspelning |

Statusraden under bilden visar avståndet till närmaste och näst närmaste
bokstav. Använd siffrorna för att justera trösklarna.

## Kvar att göra

- Skicka till Slack: `sendMessage()` i `src/main.ts` är en tom krok. Lägg
  webhook-adressen i en serverfunktion, inte i klienten.
- SMS öppnas i dag via en `sms:`-länk som kräver ett tryck på skärmen.
- Bestämma alternativ till de svåraste bokstäverna (golvposer, U och V).
- Lägga upp appen på en HTTPS-adress.
