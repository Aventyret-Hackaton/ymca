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
- **Inspelningsläge** (kugghjulet uppe till höger på startsidan, eller `?setup`
  i adressen): för oss i teamet. Ingen inloggning, så vem som helst som hittar
  knappen kommer in. Här spelas poser in. Inget skrivs, men en igenkänd pose
  visas i bildens hörn så att man kan kontrollera sina mallar.

Röststyrningen använder webbläsarens inbyggda taligenkänning (`src/voice.ts`).
Den finns i Chrome och Safari men inte i Firefox, och kräver mikrofon och
internet eftersom ljudet tolkas hos Google respektive Apple.

## Så fungerar det

1. **Spela in poser.** I inställningarna väljer man en bokstav och
   trycker på Spela in. Efter fem sekunders nedräkning sparas posen som en mall.
   Spela in varje bokstav några gånger, gärna med olika personer.
2. **Skriv.** I användarläget jämförs den aktuella posen med alla mallar.
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

1. Fyll i ditt namn i inställningarna. Det blir filnamnet (`Åsa K` blir
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
| `src/voice.ts` | Röstkommandon via webbläsarens taligenkänning. Kommandoorden står i `COMMAND_WORDS` |
| `vite.config.ts` | Slår ihop `templates/*.json` till en fil för appen och tar emot Spara till repot |
| `src/main.ts` | Gränssnitt, ritning, håll-för-att-bekräfta och inspelning |

Statusraden under bilden visar avståndet till närmaste och näst närmaste
bokstav. Använd siffrorna för att justera trösklarna.

## Kvar att göra

- Bestämma alternativ till de svåraste bokstäverna (golvposer, U och V).

## Feature-backlogg

Idéer och funktioner som inte är byggda än. Lägg till nya punkter här.

- **Skicka till Slack.** `sendMessage()` i `src/main.ts` är en tom krok. Lägg
  webhook-adressen i en serverfunktion, inte i klienten.
- **Skicka som SMS.** Inte byggt. En `sms:`-länk kräver ett tryck på skärmen.
- **Lägga upp appen på en HTTPS-adress.**

### Bonustekniker

Idéer kopplade till listan över bonustekniker (1 poäng per extra teknik).
Numren följer listan. Storleken är en grov gissning: S är någon timme, M en
halv dag, L mer än så.

| Nr | Teknik | Idé | Storlek |
|---|---|---|---|
| 1 | 3D-drivet gränssnitt | **3D-avatar.** En figur i Three.js som speglar användarens kropp i realtid, byggd på samma kroppspunkter som igenkänningen (MediaPipe ger även 3D-koordinater). Bekräftade bokstäver kan flyga in som 3D-text. | M |
| 2 | Kamera och mikrofon | Redan byggt: poser via kameran och röstkommandon via mikrofonen. | Klar |
| 3 | Gyro | **Uppställningshjälp.** Telefonens lutning läses av och appen säger "luta telefonen lite mer bakåt" tills vinkeln är bra. | S |
| 3 | Gyro | **Fäll telefonen för att ångra.** Läggs telefonen platt ner avbryts meddelandet. Kräver att någon går fram till telefonen, vilket passar som nödbroms. | S |
| 4 | Geolokalisering och karta | **Karta över skickade meddelanden.** Varje skickat meddelande får en markör där det dansades fram. Platsen kan också läggas till i meddelandet. Kräver lagring på en server för att visa andras markörer. | M |
| 5 | Bara tangentbord | **Inställningssidan utan mus.** Bokstavstangenter väljer pose, mellanslag eller Enter spelar in, backsteg tar bort senaste, S sparar till repot. Snabbar också upp inspelning från datorn. | S |
| 6 | Konfetti | **Konfetti vid varje bokstav**, och ett större regn när meddelandet skickas. Ritas på samma canvas eller med ett färdigt bibliotek. | S |
| 7 | Canvas, användaren ritar | **Rita i luften.** Handledens rörelse blir ett streck på skärmen, till exempel en signatur eller en krumelur som skickas med meddelandet. Startas och avslutas med röstkommando. | M |
| 8 | Öppet API | **Väder i meddelandet.** Aktuellt väder från SMHI eller Open-Meteo läggs till sist, till exempel "skickat i 3° och regn". Kombineras gärna med platsen från nr 4. | S |
| 8 | Öppet API | **Hinner du med bussen?** Nästa avgång från närmaste hållplats visas som nedräkning medan man skriver. Kräver API-nyckel hos till exempel Trafiklab. | M |
| 9 | Parkoppling av enheter i närheten | **Telefon som kamera, annan skärm som visning.** Telefonen visar en QR-kod, och en dator eller TV i rummet som skannar den visar meddelandet stort i realtid. Kräver en liten server eller WebRTC för att koppla ihop enheterna. | L |

Billigast poäng först: konfetti (6), tangentbord (5), väder (8) och
uppställningshjälp (3). De påverkar inte igenkänningen och kan byggas var för
sig.
