# Bolus Calculator (TESTVERSIE)

Een kleine web-app voor het testen van een bolus calculator met een diëtist.

**⚠️ LET OP:** Dit is een TESTVERSIE - niet voor echte dosering!

## Eigenschappen
- Geen build-stap, geen frameworks, geen server vereist.
- Volledig in het Nederlands.
- Mobiel-eerst ontwerp met grote knoppen en duidelijke invoervelden.
- Pure rekenlogica in `calc.js` gescheiden van scherm/interactie in `app.js`.
- Opslag in `localStorage` (`app_settings` en `app_logs`).

## Hoe lokaal te openen

### Optie 1: Rechtstreeks openen
Dubbelklik op `index.html` in een willekeurige webbrowser (Chrome, Firefox, Safari, Edge).

### Optie 2: Met Python
Start een lokale webserver vanuit de hoofdmap:
```bash
python3 -m http.server 8080
```
Open vervolgens in uw browser:
[http://localhost:8080](http://localhost:8080)

## Unittests uitvoeren
Open `tests.html` in de browser (of navigeer naar [http://localhost:8080/tests.html](http://localhost:8080/tests.html)).

De testpagina voert automatisch alle rekengevallen uit `calc.js` uit en toont welke tests zijn geslaagd (groen) of mislukt (rood).
