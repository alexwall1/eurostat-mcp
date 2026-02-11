# Användarguide: Eurostat-MCP i Claude

## Vad är Eurostat-MCP?

Eurostat-MCP är en koppling (MCP-server) som ger Claude direkt åtkomst till Eurostats statistikdatabas – EU:s officiella källa för europeisk statistik. Genom att aktivera denna MCP-server i Claude kan du söka efter, utforska och hämta statistik om allt från BNP och arbetslöshet till befolkning, energi och miljö – utan att lämna chatten.

MCP-servern fungerar som ett mellansteg mellan Claude och Eurostats JSON-API. Claude tolkar dina frågor, gör API-anrop och presenterar resultaten i läsbar form.

---

## Tillgängliga verktyg

MCP-servern exponerar fem verktyg som Claude kan använda:

| Verktyg | Syfte |
|---|---|
| **search_datasets** | Sök efter dataset med nyckelord |
| **get_dataset_structure** | Visa dimensioner och filterkoder för ett dataset |
| **get_dataset_data** | Hämta faktisk statistik med valfria filter |
| **preview_data** | Snabbförhandsgranskning av ett dataset (senaste perioden) |
| **find_geo_code** | Slå upp landskoder (t.ex. "Sverige" → SE) |

---

## Grundläggande arbetsflöde

Att hämta rätt statistik kräver oftast tre steg:

```
1. SÖK → Hitta rätt dataset med search_datasets
2. UTFORSKA → Granska struktur och koder med get_dataset_structure / preview_data
3. HÄMTA → Hämta data med filter via get_dataset_data
```

Det är viktigt att inte hoppa direkt till steg 3. Eurostats dataset har kryptiska dimensionskoder (t.ex. `B1GQ` för BNP, `CP_MEUR` för löpande priser i miljoner euro), och utan att först utforska strukturen riskerar du att få fel data – eller ingen alls.

---

## Steg-för-steg med exempelprompt

### Steg 1: Hitta rätt dataset

**Du skriver:**
> Jag vill jämföra BNP mellan Sverige och Tyskland de senaste fem åren. Kan du börja med att söka efter rätt Eurostat-dataset?

Claude söker då med `search_datasets` och presenterar träffar, t.ex.:

- `nama_10_gdp` – BNP och huvudkomponenter (årsdata)
- `namq_10_gdp` – Samma men kvartalsdata
- `tipsna15` – Kvartals-BNP i kompakt tabellformat

### Steg 2: Utforska datasetets struktur

**Du skriver:**
> Visa strukturen för datasetet nama_10_gdp. Vilka dimensioner och filtervärden finns?

Claude använder `get_dataset_structure` och visar vilka dimensioner som finns:

- **unit** – Enhet (t.ex. löpande priser, fasta priser, index)
- **na_item** – Indikator (t.ex. BNP till marknadspris, bruttoförädlingsvärde)
- **geo** – Land/region
- **TIME_PERIOD** – Tidsperiod

> 💡 **Tips:** Du kan också be Claude göra en `preview_data` för att se exempelrader och förstå vilka värden som faktiskt finns i datasetet.

### Steg 3: Hämta data med filter

**Du skriver:**
> Hämta BNP till marknadspris i löpande priser (miljoner euro) för Sverige och Tyskland från 2020 och framåt.

Claude bygger då ett anrop med filter:
```json
{
  "geo": ["SE", "DE"],
  "unit": "CP_MEUR",
  "na_item": "B1GQ",
  "sinceTimePeriod": "2020"
}
```

Och du får en tydlig tabell med värden.

---

## Fler exempelprompts

### Söka efter ett ämnesområde

> Sök efter Eurostat-dataset om arbetslöshet i EU.

> Finns det data om energikonsumtion per capita i Eurostat?

> Sök efter statistik om migration till EU-länder.

### Slå upp landskoder

> Vad är Eurostats kod för Österrike?

Claude använder `find_geo_code` och returnerar `AT`. Verktyget klarar även otydliga sökningar som "Osterreich" eller "Czech Republic".

### Förhandsgranska ett dataset

> Ge mig en förhandsgranskning av datasetet `une_rt_m` så jag förstår vad det innehåller.

Detta är särskilt användbart för att se vilka enheter, indikatorer och länder som ingår innan du bygger ditt filter.

### Jämföra länder

> Jämför arbetslösheten (säsongsrensad, procent) i Sverige, Danmark och Finland kvartalsvis sedan 2019. Använd Eurostats data.

### Hämta aggregerad EU-data

> Visa EU27-aggregatets totala BNP i löpande priser, årligen, de senaste 10 åren.

Geokoden för EU-aggregatet är `EU27_2020`.

### Tidsserie för ett enskilt land

> Hämta Sveriges befolkningsutveckling från Eurostat, årligen, sedan 2000.

### Regionala data (NUTS-nivåer)

> Finns det regionala data (NUTS2) om sysselsättningsgrad? Visa strukturen för ett sådant dataset.

Eurostat har data på olika regionala nivåer (NUTS1, NUTS2, NUTS3). Du kan filtrera med `geoLevel` i dina anrop.

---

## Filtrering – en djupare genomgång

### Geografiska filter

| Filter | Beskrivning | Exempel |
|---|---|---|
| `geo` | Specifikt land eller region | `"SE"`, `["SE", "FI", "DK"]` |
| `geoLevel` | Geografisk nivå | `"country"`, `"nuts2"`, `"aggregate"` |

Landskoder följer ISO 3166-1 alpha-2 (SE, DE, FR, etc.). Aggregat som `EU27_2020`, `EA20` finns också.

### Tidsfilter

| Filter | Beskrivning | Exempel |
|---|---|---|
| `sinceTimePeriod` | Från och med | `"2018"` |
| `untilTimePeriod` | Till och med | `"2023"` |
| `lastTimePeriod` | Senaste N perioder | `"5"` |
| `time` | Exakt period | `"2022"`, `["2020", "2021"]` |

### Övriga dimensionsfilter

Varje dataset har sina egna dimensioner. Vanliga exempel:

- `unit` – Enhet (t.ex. `"PC"` för procent, `"CP_MEUR"` för löpande priser i MEUR)
- `na_item` – Nationalräkenskapsindikator
- `age` – Åldersgrupp
- `sex` – Kön
- `nace_r2` – Branschklassificering

Exakt vilka koder som gäller varierar per dataset – använd alltid `get_dataset_structure` eller `preview_data` först.

---

## Begränsningar

### Begränsningar i MCP-servern

- **Ingen caching av stora dataset.** Varje anrop går direkt till Eurostats API. Upprepade frågor på samma data ger nya API-anrop.
- **Dimensionskoder visas inte alltid fullständigt.** `get_dataset_structure` visar dimensionsnamn men inte alltid alla tillgängliga koder – detta beror på hur Eurostats metadata-API svarar. Komplettera med `preview_data` för att se faktiska värden.
- **Ingen inbyggd visualisering.** MCP-servern returnerar data i textformat. Om du vill ha grafer eller diagram behöver du be Claude generera en separat artefakt (t.ex. ett React-diagram eller en HTML-fil).
- **Begränsad felhantering.** Om du anger en ogiltig filterkod (t.ex. en landskod som inte finns i datasetet) kan felmeddelandet vara kryptiskt eller otydligt.
- **Inga beräkningar.** Servern hämtar rå data men gör inga egna beräkningar som procentuella förändringar, medelvärden etc. Be Claude göra sådana beräkningar i ett separat steg.
- **Språkstöd.** Dimensionsetiketter finns på engelska (standard), franska och tyska – men inte på svenska.

### Begränsningar i Eurostats API

- **Stora förfrågningar kan misslyckas.** Om du inte filtrerar tillräckligt och begär för många datapunkter (hundratusentals värden) kan API:et ge timeout eller avvisa anropet. Använd alltid filter.
- **Datakvalitet varierar.** Inte alla länder rapporterar alla indikatorer, och det kan finnas luckor (null-värden) i dataseten – särskilt för nyare perioder eller mindre länder.
- **Fördröjd publicering.** Eurostat uppdaterar data enligt fasta scheman. Den allra senaste periodens data kan vara preliminär eller saknas helt.
- **Metadata kan vara inkonsekvent.** Datasetnomenklaturen (koderna) utvecklas över tid. Äldre dataset kan ha annorlunda dimensionsnamn än nyare.
- **Hastighetsbegränsningar.** Eurostats API har rate limits. Vid många anrop i snabb följd kan svar bli långsamma eller blockerade tillfälligt.
- **Inga mikro- eller individdata.** Eurostat publicerar enbart aggregerad statistik – du kan inte hämta data på företags- eller individnivå.

---

## Tips för bästa resultat

1. **Börja alltid med sökning.** Gissa inte datasetkoder – sök efter dem.
2. **Utforska innan du hämtar.** Använd `get_dataset_structure` och `preview_data` innan du bygger filter.
3. **Var specifik med filter.** Ju fler filter du anger, desto snabbare och mer träffsäkert svar.
4. **Sök på engelska.** Eurostats dataset har engelska titlar och beskrivningar – söktermer som "unemployment" fungerar bättre än "arbetslöshet".
5. **Använd `find_geo_code` vid osäkerhet.** Landskoder som "EL" (Grekland) och "UK" (Storbritannien) kan överraska. Slå upp dem.
6. **Be Claude om beräkningar efteråt.** Om du vill se procentuell förändring, ranking eller medelvärden – be om det som ett separat steg efter att data hämtats.
7. **Kombinera med andra MCP-servrar.** Du kan jämföra Eurostat-data med svensk SCB-data (via SCB-MCP) i samma konversation.
