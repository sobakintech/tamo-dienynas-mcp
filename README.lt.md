# TAMO dienynas MCP

[English](README.md) · **Lietuviškai**

Prijunkite savo dirbtinio intelekto asistentą (Claude, ChatGPT ir kitus) prie **TAMO** elektroninio dienyno. Viską sukonfigūravę galėsite klausti, pavyzdžiui:

- „Kokie namų darbai rytoj ir kurių dar nepadariau?“
- „Koks mano matematikos vidurkis šį pusmetį?“
- „Ar šią savaitę gavau naujų pažymių?“
- „Kokios mano pamokos ketvirtadienį?“

Tai [MCP](https://modelcontextprotocol.io) serveris, kurį paleidžiate patys su savo TAMO prisijungimu. Jis duomenis tik skaito ir TAMO sistemoje nieko nekeičia.

> [!WARNING]
> Šis projektas yra neoficialus ir nesusijęs su TAMO. TAMO [naudojimo taisyklės](https://content.tamo.lt/taisykles/naudojimo.html) draudžia programinę prieigą už dokumentuotų integracijų ribų. Naudokite savo rizika ir tik su savo paskyra; žr. [API aprašo atsakomybės apribojimą](https://github.com/sobakintech/tamo-dienynas-api#disclaimer).

## Ką galima perskaityti

| Įrankis | Ką grąžina |
| --- | --- |
| `get_schedule` | Savaitės pamokas: laiką, dalyką, mokytoją, temą, pažymius, kaupiamuosius vertinimus, namų darbus, atsiskaitymų žymes |
| `get_grades` | Pažymius, kaupiamuosius vertinimus ir lankomumą pasirinktam laikotarpiui (iki 400 dienų) |
| `get_homework` | Namų darbus, kurių terminas patenka į laikotarpį, su priedais ir atlikimo būsena; galima filtruoti pagal atliktus / neatliktus |
| `get_classwork` | Ką veikėte per pamokas |
| `get_notifications` | Naujausius įvykius: naujus pažymius, namų darbus, praleistas pamokas, pagyrimus, pastabas |
| `get_school_calendar` | Mėnesio šventes, atostogas ir visos mokyklos renginius |
| `list_messages` | Žinučių sąrašą (siuntėjas, tema, neperskaityta). Žinutės neatidaromos, nes atidarius jos pažymimos kaip perskaitytos |
| `get_semester_grades` | Dalykų vidurkius, galutinius ir pusmečio ar metų įvertinimus |

Į TAMO niekas nerašoma: žinutės neatidaromos, namų darbai nepažymimi kaip atlikti. Kai kuriems duomenims paskyrai reikia aktyvios TAMO IŠMANIEMS prenumeratos.

## Prisijungimo duomenys ir privatumas

Jūsų TAMO vartotojo vardas ir slaptažodis lieka jūsų pačių serverio aplinkos kintamuosiuose. Serveris bendrauja tik su TAMO ir jūsų prijungtais DI klientais; niekas niekur nesaugoma, nekaupiama ir niekur kitur nesiunčiama. Kiekviena užklausa skaito naujausius duomenis, o serveris riboja, kiek užklausų per minutę siunčia į TAMO.

Serverį saugo dvi jūsų pasirinktos slaptos reikšmės: prieigos raktas (bearer token) klientams, kurie gali siųsti antraštes, ir slaptas URL kelias klientams, kurie priima tik URL. Saugokite jas kaip slaptažodžius – kas jas turi, gali skaityti jūsų dienyną.

## Diegimas

Reikia vietos, kurioje serveris veiktų ir būtų pasiekiamas jūsų DI klientui per HTTPS. Pasirinkite vieną iš būdų žemiau, tada [prijunkite klientą](#di-kliento-prijungimas).

### 1 būdas: Render (savo serverio nereikia)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sobakintech/tamo-dienynas-mcp)

1. Paspauskite mygtuką ir prisijunkite prie Render (užtenka nemokamos paskyros).
2. Įveskite `TAMO_USERNAME` ir `TAMO_PASSWORD`. `MCP_TOKEN` ir `MCP_PATH_TOKEN` Render sugeneruos automatiškai.
3. Kai diegimas baigsis, atidarykite paslaugos skiltį **Environment** ir nukopijuokite `MCP_PATH_TOKEN`. Serverio adresas matomas puslapio viršuje, pvz., `https://tamo-dienynas-mcp-xxxx.onrender.com`.

Nemokamame Render plane serveris užmiega po 15 minučių be užklausų, todėl pirmas klausimas po pertraukos gali užtrukti iki minutės arba vieną kartą nepavykti. Paklauskite dar kartą arba rinkitės mokamą planą, kad serveris neužmigtų.

### 2 būdas: Docker

Paruoštas atvaizdas skelbiamas adresu `ghcr.io/sobakintech/tamo-dienynas-mcp`.

```sh
cp .env.example .env   # tada užpildykite reikšmes
docker compose up -d
```

arba be Compose:

```sh
docker run -d --name tamo-mcp --env-file .env -p 8000:8000 --restart unless-stopped ghcr.io/sobakintech/tamo-dienynas-mcp:latest
```

Prieš jį pastatykite atvirkštinį tarpinį serverį su HTTPS (Caddy, Traefik, nginx, Cloudflare Tunnel…). Tinka ir bet kuri platforma, paleidžianti Dockerfile ar Node programas – Coolify, Dokploy, Railway, Fly.io – su šia saugykla be jokių pakeitimų.

### 3 būdas: Node.js

Reikia Node 22 ar naujesnės versijos:

```sh
npm ci
npm run build
npm start
```

## Nustatymai

| Kintamasis | Privalomas | Reikšmė |
| --- | --- | --- |
| `TAMO_USERNAME`, `TAMO_PASSWORD` | taip | Mokinio TAMO prisijungimas |
| `MCP_TOKEN` | taip | Prieigos raktas klientams, siunčiantiems antraštes, adresu `/mcp` |
| `MCP_PATH_TOKEN` | taip | Slaptas kelias klientams, priimantiems tik URL, adresu `/<MCP_PATH_TOKEN>/mcp` |
| `TAMO_ROLE` | ne | Rolės pavadinimo dalis, jei paskyra turi kelias roles (pvz., tėvai su dviem vaikais) |
| `PORT` | ne | Numatytoji reikšmė `8000` |
| `MAX_TAMO_REQUESTS_PER_MINUTE` | ne | Numatytoji reikšmė `30` |

Raktus sugeneruokite komanda `openssl rand -hex 32` arba bet kuriuo slaptažodžių generatoriumi. `/healthz` atsako be autentifikacijos – tinka veikimo stebėjimui.

## DI kliento prijungimas

Yra du adresai; naudokite tą, kurį palaiko jūsų klientas:

- **Tik URL:** `https://<jūsų-serveris>/<MCP_PATH_TOKEN>/mcp`, be autentifikacijos.
- **URL ir antraštė:** `https://<jūsų-serveris>/mcp` su antrašte `Authorization: Bearer <MCP_TOKEN>`.

**Claude (claude.ai, kompiuterio ir telefono programėlės):** Settings → Connectors → Add custom connector. Įklijuokite „tik URL“ adresą. Claude.ai pridėtos jungtys matomos ir kompiuterio bei telefono programėlėse.

**ChatGPT:** Settings → Apps & Connectors → Advanced settings → įjunkite Developer mode, tada sukurkite jungtį su „tik URL“ adresu ir be autentifikacijos.

**Claude Code:**

```sh
claude mcp add --transport http tamo https://<jūsų-serveris>/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

**Kiti klientai** (Cursor, VS Code, LibreChat…): pridėkite Streamable HTTP MCP serverį su bet kuriuo iš adresų.

Tada tiesiog klauskite apie namų darbus, pažymius ar tvarkaraštį. Datos interpretuojamos Europe/Vilnius laiku.

## Kūrimas

```sh
npm ci
npm test
```

Šio serverio naudojami TAMO galiniai taškai aprašyti [neoficialiame TAMO dienyno API apraše](https://github.com/sobakintech/tamo-dienynas-api).
