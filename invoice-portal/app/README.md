# Invoice Portal

A self-hosted invoice, time tracking and accounting portal for small businesses. Danish UI by default, with English UI available in the Home Assistant add-on.

## Funktioner

- Login-beskyttet adminside
- SQLite-baserede login-sessioner i stedet for MemoryStore
- Firmaindstillinger med reg.nr./kontonr. eller IBAN/BIC/SWIFT
- Kundekartotek
- CVR-opslag ved oprettelse/redigering af firmakunder
- Fakturaoprettelse med flere linjer
- Automatisk fakturanummer: `2026-001`, `2026-002`, osv.
- PDF-download
- Email-afsendelse af faktura-PDF via SMTP
- Mail-menu til at læse indbakken via IMAP
- Flere mailkonti
- Skriv og svar på emails direkte fra portalen
- Udgiftsregistrering med kvitterings-/bilagsupload
- Tilbagevendende udgifter med automatisk oprettelse af forfaldne poster
- Årsoversigt: omsætning, udgifter og estimeret resultat
- Regnskabsrapporter for valgfri periode med PDF-download
- SQLite database i `./data`
- Ingen moms som standard, egnet til PMV
- Docker Compose klar
- Pæne fejl-/beskedsider i stedet for rå browsertekst

## Start

```bash
cd invoice-portal
```

Kopier eventuelt eksempel-filen først, hvis du ikke allerede har en compose-fil:

```bash
cp docker-compose.example.yml docker-compose.yml
```

Redigér `docker-compose.yml`:

```yaml
ADMIN_USERNAME: admin
ADMIN_PASSWORD: "lav-et-stærkt-password"
SESSION_SECRET: "lav-en-lang-tilfældig-secret"
CVR_USER_AGENT: "Invoice Portal - your@email.com"
```

Start:

```bash
docker compose up -d --build
```

Åbn:

```text
http://DIN-SERVER-IP:3030
```

## CVR-opslag

Portalen bruger `https://cvrapi.dk/api` til CVR-opslag.

Det er vigtigt at sætte `CVR_USER_AGENT` i `docker-compose.yml`, fordi CVR API ikke vil have standard User-Agent.

Du kan slå funktionen fra:

```yaml
CVR_LOOKUP_ENABLED: "false"
```

## Kvitteringer / bilag

Når du opretter en udgift, kan du vedhæfte en kvittering som:

```text
PDF
JPG/JPEG
PNG
WEBP
```

Maksimal filstørrelse er 10 MB pr. bilag.

Filerne gemmes lokalt i:

```text
./data/uploads/receipts
```

Kvitteringer kan kun åbnes, når du er logget ind i portalen.

## Backup

Alt vigtigt ligger i:

```text
./data/faktura.sqlite
./data/sessions.sqlite
./data/uploads/receipts
```

Backup eksempel:

```bash
tar -czf faktura-backup-$(date +%F).tar.gz ./data
```

## Reverse proxy / Cloudflare Tunnel

Hvis du kører bag Cloudflare Tunnel, Nginx Proxy Manager eller Traefik, kan du normalt pege mod:

```text
http://invoice-portal:3000
```

Eller LAN-adressen:

```text
http://SERVER-IP:3030
```

Sæt `TRUST_PROXY=true`, hvis portalen ligger bag en reverse proxy med HTTPS.

## PMV-note

Systemet er sat op uden moms. På PDF'en står:

> Virksomheden er ikke momsregistreret. Der opkræves derfor ikke moms.

Tjek altid selv kravene hos Skattestyrelsen, især hvis du nærmer dig omsætningsgrænsen for PMV.


## Sessions

Login-sessioner gemmes i:

```text
./data/sessions.sqlite
```

Det betyder, at portalen ikke længere bruger Express' standard `MemoryStore`.
Dermed forsvinder advarslen:

```text
Warning: connect.session() MemoryStore is not designed for a production environment
```

Sessionerne ligger i `./data`, så de er inkluderet i normal backup.


## v1.5.1 fix

Rettet SQLite session store, så `better-sqlite3-session-store` får en korrekt database-client:

```js
store: new BetterSqlite3SessionStore({
  client: sessionDb
})
```

Dette retter fejlen:

```text
A client must be directly provided to SqliteStore
```


## Tilbagevendende udgifter

Brug menuen **Faste udgifter** til at oprette faste udgifter som bankgebyrer, softwareabonnementer, telefon/internet osv.

Når du klikker **Opret forfaldne**, oprettes almindelige udgiftsposter for alle faste udgifter, der har en `next_date` til og med den valgte dato.

Allerede oprettede faste udgifter duplikeres ikke for samme dato.

## Regnskabsrapporter

Brug menuen **Rapporter** til at vælge en periode og oprette en PDF med:

```text
Omsætning
Udgifter
Resultat før skat
Fakturaliste
Udgiftsliste
```


## v1.6.1 fix

Rettet sidebaggrund, så dark background fylder hele viewporten på korte sider.
Det fjerner den vandrette farveforskel/streg, der kunne ses midt på siden.


## Email-afsendelse

Under **Indstillinger** kan du udfylde SMTP-oplysninger.

Typiske SMTP-eksempler:

```text
Port 587: STARTTLS, smtp_secure = 0
Port 465: SSL/TLS, smtp_secure = 1
```

Når SMTP er sat op, får hver faktura en **Send email** knap.
Fakturaen sendes som PDF-vedhæftning.

Tilgængelige variabler i email-emne og email-tekst:

```text
{{invoice_no}}
{{customer_name}}
{{company_name}}
{{due_date}}
```


## Mail / IMAP

Under **Indstillinger** kan du udfylde IMAP-oplysninger, så portalen kan læse indbakken.

Typisk cPanel-mail:

```text
IMAP host: mail.veltrix.dk
IMAP port: 993
IMAP sikker forbindelse: SSL/TLS
IMAP brugernavn: faktura@veltrix.dk
IMAP adgangskode: mailbox password
IMAP mappe: INBOX
```

Mail-menuen viser de seneste emails og kan åbne selve mailindholdet.
Vedhæftninger vises som liste, men download af vedhæftninger er ikke aktiveret endnu.


## Flere mailkonti, skriv og svar

Brug menuen **Mailkonti** til at tilføje ekstra emailadresser, fx:

```text
faktura@veltrix.dk
support@veltrix.dk
kontakt@veltrix.dk
```

Hver konto kan have egne SMTP- og IMAP-indstillinger.

Fra **Mail** kan du:
- vælge konto
- læse indbakken
- skrive ny email
- svare på en email

Vedhæftninger til almindelige emails er ikke aktiveret endnu.


## v1.9.1 navigation fix

Mailkonti er flyttet ud af hovedmenuen og ind som undermenu under **Indstillinger**.
Selve Mail-menuen er stadig i hovedmenuen.


## v1.9.2 mail account selection fix

Mail-menuen vælger nu automatisk første konto med IMAP sat op.
Den gamle Standard-konto vises kun som mailkonto, hvis den faktisk har SMTP eller IMAP host konfigureret.
Dette forhindrer, at Mail-siden automatisk vælger en ikke-fungerende Standard-konto.


## v1.9.3 navigation + unread badge

- **Faste udgifter** er flyttet ud af hovedmenuen og ligger nu under **Udgifter**.
- **Mail**-knappen i hovedmenuen viser en lille badge med samlet antal ulæste mails fra IMAP-konti.
- Ulæst-tallet hentes via `/api/mail/unread-count`, så resten af siden stadig kan indlæse hurtigt.


## v1.9.4 unread badge fix

Mail-badge tæller nu ulæste mails ved at søge efter mails uden `\Seen`-flag i IMAP-mappen.
Det er mere pålideligt på cPanel/IMAP-servere end kun at bruge `STATUS unseen`.

Debug/test:

```text
/api/mail/unread-count
```

Returnerer samlet antal ulæste mails og antal pr. mailkonto.


## v1.9.5 read/unread mail state

Når en mail åbnes i portalen, sættes IMAP `\Seen`-flagget automatisk.
Det betyder, at mailen registreres som læst på mailserveren, og ulæst-badge falder efter næste opdatering.

Mailvisningen har også en **Marker som ulæst** knap, som fjerner `\Seen`-flagget igen.


## v1.9.6 inbox readability

Indbakken viser nu læst/ulæst tydeligere:

- Ulæste mails har accentfarvet baggrund og venstre markering
- Ulæste mails har fed afsender og emne
- Læste mails er mere afdæmpede
- NY-badgen er tydeligere


## v1.9.7 inbox status/date polish

Indbakken viser nu datoer konsekvent som to linjer:

```text
10.6.2026
05.40.07
```

Ulæste mails har fed dato, og status-boblen viser nu **Ulæst** eller **Læst**.
Når en mail åbnes, sættes den til læst via IMAP, og når den markeres som ulæst, skifter status-boblen tilbage.


## v1.9.8 read/unread refresh fix

Indbakken bruger nu en normaliseret `seen` status fra backend i stedet for at tjekke IMAP-flag direkte i EJS.
Mail-ruterne bruger `Cache-Control: no-store`, så browseren ikke viser en gammel indbakke efter du har læst en mail.

Ulæste mails beholder markeret baggrund, men teksten er ikke længere ekstra fed.


## v1.9.9 inbox visual preference

Indbakken beholder markeret baggrund på ulæste mails, men:
- ulæste mails er ikke længere ekstra fed
- læste mails er ikke længere dæmpede
- status-boblerne **Ulæst/Læst** beholdes


## v1.9.10 inbox table line fix

Rettet en visuel fejl i indbakken, hvor stregerne mellem emails ikke flugtede.
Årsagen var, at en `<td>` blev brugt som `display: flex`.
Nu forbliver cellen en normal table-cell, og flex-layout bruges kun inde i cellen.


## v1.9.11 customer email autocomplete

Når du skriver en almindelig email eller sender faktura-email, kan **Til**-feltet nu søge/autoudfylde fra kundelisten.

Kunder med emailadresse vises som forslag:

```text
Kundenavn · kunde@email.dk
```

Du kan stadig skrive en hvilken som helst emailadresse manuelt.


## v1.10.0 firmadokumenter

Ny **Dokumenter** menu til firma-relaterede dokumenter.

Dokumenter gemmes i:

```text
./data/uploads/documents
```

Metadata gemmes i SQLite-tabellen:

```text
company_documents
```

Understøttede filtyper:

```text
PDF, JPG, PNG, WEBP, TXT, CSV, Word, Excel
```

Maks filstørrelse pr. dokument er 25 MB.


## v1.10.1 document upload fix

Rettet fejl ved upload af dokumenter:

```text
documentUpload is not defined
```

Dokument-upload har nu en korrekt defineret multer-handler til `./data/uploads/documents`.


## v1.10.2 document preview modal

Dokumenter åbnes nu i en modal/popup direkte på Dokumenter-siden i stedet for automatisk at åbne i en ny browserfane.

PDF og billeder vises direkte i modalen.
Andre filtyper forsøges vist i iframe og har stadig en **Åbn i ny fane** knap som fallback.


## v1.10.3 documents navigation fix

Dokumenter-linket er nu sikret flere steder:

- Topmenuen
- Dashboard hurtigknap
- Indstillinger → Undermenuer

Selve siden kan altid åbnes direkte på:

```text
/documents
```


## v1.11.0 logo and email signature

Under **Indstillinger** kan du nu uploade et firmalogo.

Logoet gemmes i:

```text
./data/uploads/company
```

Logoet vises på:

```text
Faktura-PDF
Regnskabsrapport-PDF
```

Under **Indstillinger** kan du også udfylde en email-signatur.

Signaturen bruges ved:

```text
Almindelige emails fra Mail → Skriv ny
Faktura-emails
```

Logo understøtter:

```text
JPG, PNG, WEBP
```

Maks logo-størrelse er 5 MB.


## v1.11.1 logo PDF + menu freeze fix

Rettet at logo ikke blev sendt med til faktura-PDF ruten.

Bemærk om logoformat:
- PNG og JPG er mest stabile i PDF.
- WEBP kan vises i browseren, men understøttes ikke altid af PDF-rendering.

Topmenuens mail-badge har nu timeout:
- Server-side IMAP-check stopper efter ca. 3,5 sekunder pr. konto.
- Browser-fetch stopper efter ca. 4,5 sekunder.
- Det forhindrer, at menuen føles låst, hvis IMAP-serveren svarer langsomt.


## v1.11.2 PDF layout and menu freeze mitigation

PDF:
- Faktura-overskriften er nu centreret på siden, uanset logo.
- Fakturadato og forfaldsdato vises nu i dansk format, fx `10.06.2026`.
- Regnskabsrapportens periode vises også i dansk format.

Menu/mail-badge:
- Mail-badge hentes først efter page load.
- Browser-fetch timeout er sat kortere.
- Server-side IMAP timeout er sat kortere.
- Badge kan ikke længere opfange klik i topmenuen.


## v1.11.3 topbar click hardening

Rettet/afhjulpet et problem hvor de højre menupunkter i topbaren kunne virke låste efter gem i Indstillinger.

Ændringer:
- Topbar og links får højere z-index.
- Skjulte badges/overlays kan ikke fange klik.
- Mail badge script kører kun på Mail-sider.
- Topbar links og logout-knap tvinges til at være klikbare.


## v1.11.4 topbar layout rollback/fix

Rettet v1.11.3-regression hvor mail-badge kun blev vist på Mail-sider.

Topmenu:
- Mail-badge vises igen på alle sider.
- v1.11.3 sticky/z-index hardening er fjernet.
- Topbaren bruger nu et rent flex-layout.
- Pseudo-overlays på topbar/nav neutraliseres.
- Badge henter ulæste mails efter kort delay, så menuen er klikbar med det samme efter redirect.


## v1.12.0 grouped navigation

Topmenuen er ryddet op og grupperet:

```text
Dashboard | Fakturaer | Kunder | Økonomi | Arkiv | Mail | Indstillinger | Log ud
```

Dropdowns:

```text
Fakturaer:
- Ny faktura

Økonomi:
- Udgifter
- Faste udgifter
- Rapporter

Arkiv:
- Dokumenter
```

Funktioner er ikke ændret. Dette er primært en UI/navigation-polish.


## v1.13.0 time tracking / task timers

Ny **Tid** menu til opgaver og timere.

Funktioner:
- Opret opgave med navn.
- Vælg type: **Indtægt** eller **Udgift**.
- Tilknyt opgave til kunde/punkt.
- Sæt timepris/sats.
- Start/stop timer.
- Flere tidsregistreringer på samme opgave over flere dage.
- Manuel tidsregistrering med start/slut.
- Opgaver viser samlet tid og estimat ved timepris.
- Opgaver kan lukkes/genåbnes.

Data gemmes i SQLite-tabellerne:

```text
time_tasks
time_entries
```

Første version laver ikke automatisk faktura eller udgift ud fra tid. Det kan tilføjes senere.


## v1.13.1 time tracking database startup fix

Rettet opstartsfejl i `src/db.js`:

```text
SyntaxError: Unexpected identifier 'TABLE'
```

Tidsregistreringens database-tabeller oprettes nu korrekt via `db.exec(...)`.

## v1.14.0 time-to-invoice workflow + invoice editing

Denne version bygger videre på Tid-modulet og gør det muligt at bruge registreret tid direkte i regnskabet.

Nyt i Tid:
- Tidsopgaver af typen **Indtægt** kan overføres direkte til en ny faktura.
- Tidsopgaver af typen **Udgift** kan overføres direkte til en ny udgift.
- Opgaven skal have afsluttet tid; en kørende timer skal stoppes først.
- Indtægtsopgaver skal have kunde og timepris før faktura kan oprettes.
- Udgiftsopgaver skal have sats/timepris før udgift kan oprettes.
- Når en opgave overføres, markeres den som lukket og kobles til faktura/udgift.
- Koblingen kan fjernes igen uden at slette selve fakturaen eller udgiften.
- Tid-oversigten viser samlet ikke-faktureret tid/værdi og ikke-bogført udgiftstid/værdi.

Nyt i Faktura:
- Eksisterende fakturaer kan nu redigeres.
- Fakturalinjer kan tilføjes, fjernes og ændres efter oprettelse.
- Fakturaer kan duplikeres som ny kladde.

Nye databasefelter oprettes automatisk ved start:

```text
time_tasks.invoice_id
time_tasks.expense_id
time_tasks.billed_at
time_tasks.billing_note
invoices.source_time_task_id
expenses.source_time_task_id
```

Eksisterende `./data` skal stadig bevares ved opdatering.
