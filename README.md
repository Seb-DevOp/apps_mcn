# MCN — THE VAULT · V1 + V2.1 + V2.2 + comptes + Mini App Farcaster

> Quiet strength never rushes. The Vault is filling.

Application mobile-first (PWA) de l'univers **Maine Coon Network**. V1 est la fondation
jouable : un joueur entre sans wallet ni e-mail, ouvre son Coffre Quotidien, joue une
session de 30 secondes, complète ses missions, progresse dans les six rangs des Gardiens,
explore le Vault et se compare aux autres.

**Principe directeur, valable pour les quatre versions :**
MCN The Vault n'est pas un dashboard de staking auquel on a greffé un jeu. C'est un jeu de
progression sociale bâti autour de l'écosystème MCN, dans lequel la blockchain sera
intégrée progressivement. Le staking est une mécanique ; **le jeu est le produit**.

---

## Démarrage

Il faut une base PostgreSQL. Le dépôt en embarque une : `npm run dev:db` démarre un
PostgreSQL portable (téléchargé au premier lancement, hors du projet pour qu'aucun dossier
synchronisé n'y touche). Aucun Docker, aucune installation système, aucun accès à Neon
partagé.

```bash
npm install
npm run dev:db          # démarre la base locale et affiche sa DATABASE_URL
cp .env.example .env    # renseignez DATABASE_URL, DATABASE_URL_UNPOOLED, SESSION_SECRET
npm run setup           # client Prisma + migrations + contenu
npm run dev             # http://localhost:3000
```

Une **branche de développement Neon** (neon.tech → votre projet → *Branches* → *New
branch*) fait aussi l'affaire si vous préférez travailler contre la même infrastructure
qu'en production.

| Script | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run dev:db` / `dev:db:stop` | PostgreSQL portable local |
| `npm run build` / `npm start` | build et exécution en production |
| `npm run setup` | generate + migrate deploy + seed |
| `npm run db:migrate` | crée une migration après modification du schéma |
| `npm run db:seed` | re-sème le contenu (idempotent) |
| `npm run db:studio` | inspecteur de base Prisma |
| `npm run typecheck` | `tsc --noEmit` |

`SEED_DEMO="true"` ajoute 12 Gardiens de démonstration pour remplir le classement.
C'est **opt-in** : la production démarre avec de vrais joueurs uniquement.

`puppeteer-core` est une dépendance de développement : il pilote le navigateur déjà
installé sur la machine pour prendre des captures des écrans et vérifier le rendu réel.
Il n'entre jamais dans le build.

Toutes les commandes Prisma passent par [scripts/with-db-env.mjs](scripts/with-db-env.mjs),
qui normalise les noms de variables de connexion (chaque hébergeur les nomme
différemment) avant d'appeler Prisma. Il n'affiche jamais les URL elles-mêmes.

---

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Framer Motion ·
Prisma 6 · PostgreSQL (Neon).

Le schéma évite délibérément les enums natifs, les colonnes `Json` et les tableaux : il
reste portable vers n'importe quel PostgreSQL, managé ou auto-hébergé.

---

## Déploiement

Hébergé sur **Vercel**, base **Neon**. Chaque `git push` sur `main` déclenche un
déploiement.

Le build exécute, dans l'ordre : `prisma generate` → `prisma migrate deploy` →
`seed` → `next build`. Les migrations et le contenu sont donc appliqués automatiquement à
chaque déploiement. Le seed est idempotent.

Variables d'environnement à définir dans Vercel :

| Nom | Valeur |
| --- | --- |
| `DATABASE_URL` | connexion **pooled** Neon (hôte en `-pooler`) — injectée par l'intégration |
| `DATABASE_URL_UNPOOLED` | connexion **directe** Neon — requise par les migrations |
| `SESSION_SECRET` | valeur aléatoire forte (le serveur refuse de démarrer sans) |
| `NEXT_PUBLIC_WALLET_ENABLED` | `false` |
| `MCN_TOKEN_REWARDS_ENABLED` | `false` |
| `NEXT_PUBLIC_MCN_CHAIN` | `base` |

Neon exige deux connexions : une *poolée* pour l'application (le serverless ouvre trop de
connexions sans pooler) et une *directe* pour les migrations, qui ne peuvent pas passer par
un pooler.

**À revoir en V2 :** le seed tourne à chaque déploiement et réécrit les tables de
configuration avec les valeurs du code. C'est correct tant que la configuration n'est
éditable que par le code ; dès que le panneau d'administration V2 permettra de la modifier
en base, le seed devra devenir une étape ponctuelle et non plus une étape de build.

---

## Ce que contient la V1

**Entrée** — inscription obligatoire : pseudo, e-mail, mot de passe saisi deux fois.
Cookie de session signé (HMAC, httpOnly). Ni wallet ni paiement, jamais.

**Six rangs** — ⚜️ Vagabond → 🐾 Gardien → 🛡️ Gardien Royal → ⭐ Gardien d'Élite →
💎 Gardien du Vault → 👑 Légende. Seuils : 0 / 500 / 2 000 / 6 000 / 15 000 / 40 000 XP.
Les illustrations livrées sont utilisées telles quelles, jamais recolorées ni permutées.

**Coffre Quotidien évolutif** — un coffre gratuit par jour, différent à chaque rang
(dessin, palette, ornements, pool de récompenses). Deux règles tenues par le moteur, pas
par la chance : le coffre **donne toujours quelque chose** (entrées garanties tirées avant
tout tirage pondéré), et **les probabilités sont affichées** au joueur (bouton
« Probabilités »), telles que le serveur les utilise.

**Série indulgente** — cycle de 7 jours, avec des *Boucliers de Série* : un jour manqué est
absorbé au lieu d'effacer des semaines de fidélité. Une série vraiment rompue ne fait que
remettre le compteur à 1 — aucun XP, objet ou rang n'est jamais retiré.

**Résonance de Cristal** — le mini-jeu. Quatre cristaux, un anneau qui se referme, un
timing à trouver. ~30 s, jouable au pouce. Combos, cristaux dorés × 2, et une pénalité
pour les touches dans le vide : le jeu récompense la précision, pas la vitesse de tapotage.

**Missions** — 4 quotidiennes et 3 hebdomadaires, tirées de façon déterministe par joueur
et par période. La progression n'avance que sur des événements serveur vérifiés.

**Le Vault** — six chambres déverrouillées par rang, six registres de lore, et un
« Murmure du jour » qui change chaque jour. Le contenu verrouillé affiche une **vraie**
condition (« Nécessite le rang Gardien Royal »), jamais un teaser fictif.

**Classements** — XP global, meilleure session, semaine en cours, plus longue série.
Quatre tables volontairement : la persistance, l'adresse et la fidélité doivent pouvoir
briller séparément. Le joueur voit toujours sa propre ligne, même loin du top 25.

**Profil** — identité, palmarès, collection (badges, cosmétiques, matériaux, fragments,
clés), activation des boosts, langue, wallet.

**Bilingue FR/EN** — aucun texte d'interface codé en dur.
[`src/lib/i18n/en.json`](src/lib/i18n/en.json) et [`fr.json`](src/lib/i18n/fr.json).
Le contenu de jeu (rangs, objets, lore) porte ses deux langues dans ses fichiers de contenu
et en base.

**PWA** — manifest, icônes, service worker (cache des illustrations uniquement — jamais
l'état de jeu), installable sur iOS et Android.

---

## Ce que contient la V2.1 — l'épine dorsale équipement

**33 pièces d'équipement** : 21 armes réparties sur les quatre classes du brief
(Sceptres, Arcs, Épées, Épées Magiques) plus armures, capes, reliques et accessoires.
Cinq emplacements, six raretés, cinq niveaux par pièce.

**Une règle de conception appliquée sans exception : chaque statistique fait réellement
quelque chose.** MCN n'a pas de combat — « Puissance », « Défense » et « Stabilité »
seraient de la décoration, alors que le brief exige qu'une arme soit utile et qu'aucune
progression ne soit factice. Les quatre classes tirent donc leur identité d'effets réels :

| Classe | Identité | Effets |
| --- | --- | --- |
| Sceptres | progression | +XP, +Éclats |
| Arcs | adresse | fenêtre de timing élargie, +score |
| Épées | régularité | absorbe les notes manquées, +score |
| Épées Magiques | économie | +Éclats, tirages de coffre supplémentaires |

Les statistiques de combat arriveront le jour où un mini-jeu de combat existera.

**Capacités actives** — une activation par session, au moment choisi par le joueur.
Le client dit *quand*, le serveur rejoue la même fenêtre sur le même motif : le bonus ne
peut être ni réclamé deux fois ni étiré.

**Améliorations** — Éclats + matériaux, jamais d'XP. Le rang dérive de l'XP total :
dépenser de l'XP rétrograderait le joueur, et un système de progression ne doit jamais
reprendre le rang qu'il vient d'accorder.

**Plafonds** — un plafond global (×2,5) sur les multiplicateurs de récompense, plus un
plafond par statistique. Aucune combinaison d'équipement, de niveaux et de boosters ne
peut dérégler l'économie ni rendre le mini-jeu trivial.

**La Forge (V2.2)** — deux routes vers la même arme : les Éclats l'achètent aujourd'hui,
les fragments la méritent avec le temps. Les recettes sont dérivées de la rareté, donc
toute arme ajoutée au catalogue est forgeable immédiatement. Les coffres d'Élite, du
Gardien du Vault et de Légende peuvent lâcher de l'équipement — un doublon **se démonte
automatiquement en fragments**, jamais perdu. Démonter une pièce rend toujours strictement
moins qu'elle n'a coûté : la Forge ne peut pas servir de blanchisserie à matériaux.
Les probabilités de butin d'équipement sont affichées dans la même feuille que le reste.

**Boutique en Éclats du Vault uniquement.** Aucun argent réel en V2 : l'abstraction de
paiement reste inerte, comme le wallet. Conforme au découpage V4 = économie MCN.

---

## Authentification

**L'inscription est obligatoire** : pseudo, e-mail et mot de passe confirmé. Il n'existe
aucun compte anonyme, donc le rang, la série et la collection appartiennent à une personne
dès le premier coffre plutôt qu'au cookie d'un navigateur. À la connexion, **le pseudo ou
l'e-mail** fonctionnent indifféremment : un joueur se souvient bien mieux du nom qu'il a
choisi que de l'adresse qu'il a utilisée.

Deux méthodes s'ajoutent ensuite, depuis le profil :

**Passkey** — empreinte, Face ID ou code d'écran. Rien à retenir, et la plateforme la
synchronise via iCloud ou Google : elle survit à la perte du téléphone. La clé privée ne
quitte jamais l'appareil, donc il n'existe de notre côté aucun secret à voler. Vérification
déléguée à `@simplewebauthn` : l'attestation WebAuthn est typiquement le code qui paraît
juste et ne l'est pas.

**Codes de secours** — six codes à usage unique, le plancher sous tout le reste. Seuls les
hachages sont stockés : lire la base ne donne aucun accès.

**E-mail + mot de passe** — la voie familière. Hachage scrypt (bibliothèque standard de
Node : ni binaire natif à faire échouer au build, ni dépendance tierce sur le chemin qui
protège les comptes). La connexion fait le même travail que l'adresse existe ou non, donc
le temps de réponse ne révèle pas quels comptes existent.

**Farcaster et wallet** — table, service et points d'entrée écrits, et **refusés** tant que
les drapeaux sont à `false`. Lier une identité externe non vérifiée, c'est une prise de
contrôle de compte qui attend : le comportement honnête est de dire non. Ni l'un ni l'autre
ne sera jamais nécessaire pour jouer ou conserver sa progression.

**L'envoi d'e-mails est inerte** tant que `RESEND_API_KEY` et `EMAIL_FROM` ne sont pas
définis, et l'interface le dit plutôt que de prétendre avoir envoyé un message. C'est
tenable parce que passkey et codes de secours couvrent déjà « j'ai perdu l'accès » :
l'e-mail est le confort, pas le plancher.

**Compromis assumé, à surveiller :** le brief initial demandait de ne pas exiger d'e-mail
pour jouer, et un mur d'inscription coûte toujours une part des visiteurs au premier écran.
C'est un choix produit explicite. Tant que l'envoi d'e-mails n'est pas branché, un mot de
passe oublié est sans retour : le profil le dit et pousse vers une passkey ou des codes de
secours.

Garde-fous vérifiés : retirer sa seule méthode d'accès est refusé · un code de secours ne
sert qu'une fois · les tentatives sont limitées par source *et* par adresse · une adresse
inconnue et une adresse connue reçoivent exactement la même réponse.

---

## Mini App Farcaster

L'application tourne telle quelle dans un client Farcaster. Trois pièces :

**Le manifeste** — `/.well-known/farcaster.json`, servi par une route plutôt qu'un
fichier statique : la preuve de propriété du domaine est une signature produite par le
compte propriétaire, et elle a sa place dans les variables d'environnement, pas dans le
dépôt. Sans elle le manifeste reste valide et l'app fonctionne ; elle ne peut simplement
pas être publiée. L'en-tête `x-mcn-manifest-signed` dit dans quel état on se trouve.

**La carte de partage** — balise `fc:miniapp` sur la page d'entrée (plus `fc:frame`,
l'ancien nom, pour les clients qui n'ont pas suivi). Un lien partagé dans un cast devient
une carte lançable, avec l'image 3:2 de `public/share/embed.png`.

**L'authentification** — un joueur qui ouvre la Mini App est déjà identifié : son FID
crée un compte réel et persistant, sans formulaire. C'est un choix assumé face à
l'inscription obligatoire du web : imposer pseudo + e-mail + mot de passe à quelqu'un que
Farcaster a déjà authentifié détruirait le seul avantage du canal. Ces joueurs peuvent
ajouter une adresse et un mot de passe plus tard depuis leur profil.

**Seul le jeton est digne de confiance.** `sdk.context.user` est transmis par le client
et la documentation Farcaster précise qu'il peut ne pas avoir été autorisé par
l'utilisateur : le pseudo qu'il contient ne sert qu'à proposer un nom d'affichage. Le FID
sur lequel le serveur agit vient du JWT vérifié par `@farcaster/quick-auth`, et de rien
d'autre.

Variables à définir dans Vercel pour activer le canal :

| Nom | Rôle |
| --- | --- |
| `FARCASTER_AUTH_ENABLED` | `true` pour ouvrir la connexion par FID |
| `FARCASTER_HEADER` · `FARCASTER_PAYLOAD` · `FARCASTER_SIGNATURE` | la signature de propriété du domaine |
| `APP_ORIGIN` | domaine définitif — sert aussi de domaine de vérification du jeton |

Tant que `FARCASTER_AUTH_ENABLED` vaut `false`, la route refuse tout en 503 et
l'application se comporte exactement comme sur le web.

---

## Rétention des données

Trois tables grossissent à chaque action et ne valent plus rien après quelques mois :
les événements analytics bruts, les sessions de jeu terminées et le grand livre d'XP.
Laissées seules, ce sont elles qui remplissent une base — pas les joueurs.

Une purge tourne chaque nuit à 4 h via Vercel Cron (`/api/cron/purge`, protégée par
`CRON_SECRET` — sans ce secret la route refuse tout, y compris Vercel elle-même). Elle est
aussi lançable à la main : `npm run db:purge`.

| Table | Conservation |
| --- | --- |
| `AnalyticsEvent` | 90 jours |
| `GameSession` | 90 jours |
| `XpLedger` | 180 jours |
| `ScoreEntry` | 8 semaines **+ le meilleur score de chaque joueur, quel que soit son âge** |
| `Session` · `AuthChallenge` · `EmailToken` | supprimées dès expiration |

**La règle qui gouverne tout :** une purge ne doit jamais changer un nombre qu'un joueur
peut voir. Sont donc intouchés `ChestOpening` (coffres ouverts), `DailyActivity` (jours
actifs et courbes de rétention), `User`, l'inventaire et l'équipement. Le test vérifie
explicitement qu'un meilleur score vieux de 300 jours survit à la purge.

---

## Architecture serveur

Tout ce qui touche à la progression est **autoritaire côté serveur**. Le client ne peut
jamais annoncer un gain.

```
src/lib/
  content/     ranks · chests · items · missions · vault   ← source de vérité du design
  engine/      rewards · chest · game · missions · streak · leaderboard · state
  game/        pattern.ts   ← partagé mot pour mot entre le client et le serveur
  web3/        wallet.ts    ← prêt, désactivé
```

- **`applyRewards`** est le **seul** endroit où un solde change. Un seul chemin à auditer,
  un seul endroit qui écrit le grand livre d'XP, un seul endroit qui détecte une montée de
  rang (y compris quand un gain franchit deux seuils d'un coup).
- **Coffre** : la ligne `ChestOpening` unique `(userId, day)` *est* le verrou. Deux
  requêtes simultanées ne peuvent pas ouvrir deux fois.
- **Mini-jeu** : le serveur émet une graine, le client dessine le motif qu'elle produit, et
  le serveur **reconstruit le même motif** pour recalculer le score. Le client n'envoie que
  des instants de frappe. S'ajoutent : statut basculé avant notation (anti-rejeu), contrôle
  d'horloge murale (une session ne peut pas être soumise plus vite qu'elle ne se joue),
  limitation de débit, plafond d'XP par session et rendements décroissants.
- **Journalisation** : `XpLedger`, `DailyActivity`, `AnalyticsEvent` alimentent D1/D7/D30
  et la détection de fraude.

### Limite d'anti-triche, dite franchement

Un attaquant déterminé peut encore forger des instants de frappe plausibles depuis un
navigateur. Aucune V1 web ne peut l'empêcher totalement. La V1 **borne les dégâts**
(plafonds, rendements décroissants, limitation de débit, sessions signalées et conservées)
plutôt que de prétendre faire confiance au client. Le durcissement sérieux appartient à la
V3, avec le travail blockchain/récompenses.

---

## Web3 : prêt, éteint

`src/lib/web3/wallet.ts` expose les coutures — liaison de wallet, lecture de solde MCN,
réclamations — et **chacune refuse d'agir** tant que les drapeaux sont à `false` :

```env
NEXT_PUBLIC_WALLET_ENABLED="false"
MCN_TOKEN_REWARDS_ENABLED="false"
```

Le type de récompense `MCN` existe depuis le premier jour dans le `RewardService` : toute
intention de versement est enregistrée en `RewardGrant` avec le statut `DISABLED`, donc
auditable le jour où le module s'allume. `linkWallet()` accepte déjà un paramètre de
signature et refuse plutôt que de stocker une adresse non vérifiée — la V3 n'aura qu'à
implémenter la vérification, sans changer les appelants.

**Rien de tout cela ne conditionne le jeu.** Un joueur sans wallet ne perd aucune
fonctionnalité.

---

## Économie (V1)

| Source | Gain |
| --- | --- |
| Coffre Quotidien | 60–110 XP (Vagabond) → 3 000–4 500 XP (Légende) |
| Session de jeu | score / 20, plafonné à 150 XP |
| Missions | 20–90 XP (quotidiennes), 250–500 XP (hebdomadaires) |
| Montée de rang | Éclats + badge, et surtout un coffre définitivement meilleur |

Les sessions au-delà de la 5ᵉ du jour rapportent 50 %, puis 20 %, puis 5 %. Le score
continue de compter au classement. Le coffre représente 10 à 16 % d'un rang : c'est lui
l'ancre du retour quotidien, pas le grind.

Rythme visé : Gardien au jour 1, Gardien Royal vers le jour 3-4, Élite vers le jour 10,
Gardien du Vault vers le jour 25, Légende au-delà de deux mois.

---

## Points à traiter

**L'illustration du Gardien d'Élite manque.** Cinq des six images ont été livrées
(`image3` absente). Le rang 4 affiche donc un blason de remplacement honnête plutôt que
d'emprunter le portrait d'un autre rang — ce qui casserait la règle « un rang supérieur
paraît toujours plus fort ». Pour finir : déposer le fichier dans
`public/ranks/elite-guardian.png` et renseigner `artPath` dans
[src/lib/content/ranks.ts](src/lib/content/ranks.ts).

**Illustrations lourdes.** Les PNG livrés font 2,3 à 3 Mo. Next les optimise à la volée en
production, mais des sources en 1200 px de large amélioreraient nettement le premier
chargement en 4G.

**Hébergement.** Vercel plan Hobby : usage non commercial uniquement. Dès que MCN
monétise, il faudra le plan Pro. Par ailleurs, le limiteur de débit en mémoire de
[src/lib/api.ts](src/lib/api.ts) perd son effet en serverless (chaque instance a sa propre
mémoire) : la protection réelle du mini-jeu repose sur des comptages en base, mais cette
seconde couche devra passer sur Redis (Upstash) avant une ouverture publique large.

**Frontière du jour en UTC.** Volontaire : si la journée suivait l'horloge de l'appareil,
changer de fuseau distribuerait des coffres supplémentaires. Effet secondaire assumé — le
Vendredi du Vault tombe au même instant pour toute la communauté.

**Déconnexion.** `Quitter cet appareil` supprime la session ; la V1 n'a pas encore de
moyen de se reconnecter à un compte invité. À traiter avec l'authentification e-mail /
Farcaster / wallet en V2-V3.

---

## Prévu pour la suite

Reste de la V2, dans l'ordre de dépendance :

- **V2.3 Profondeur du Vault** — chambres en salles réelles, mystères 24h/48h/7j, Clés.
- **V2.4 Communauté et événements** — Vault communautaire, Vendredi du Vault, saisons.
- **V2.5 Boutique et administration** — Armurerie Royale étendue, panneau d'administration.

Le schéma accueille déjà tout cela sans migration destructive :

- `ItemDef` porte un `metaJson` libre → équipements, statistiques d'armes, futurs NFT.
- Les fragments (`frag-*`) et matériaux se collectionnent déjà → la Forge a sa matière.
- Rangs, coffres, pools, missions et config vivent **en base**, semés depuis les fichiers
  de contenu → le panneau d'administration V2 les édite sans redéploiement.
- `AppConfig` contient la saison courante → système de saisons.
- `RewardGrant` attend les récompenses MCN de la V3/V4.
- `CHAMBERS` est déjà verrouillé par rang → les chambres deviennent des salles réelles.

---

## Structure

```
prisma/          schema.prisma · seed.ts
public/
  ranks/         illustrations officielles des rangs
  icons/         icône de l'application (SVG + PNG)
  manifest.webmanifest · sw.js
src/
  app/
    page.tsx           entrée / création de compte
    (game)/            vault · play · missions · explore · ranks · leaderboard · profile
    api/               session · chest · game · missions · vault · leaderboard · profile · boost · wallet
  components/          écrans et éléments d'interface
  lib/
    content/ engine/ game/ i18n/ web3/
    auth.ts · db.ts · time.ts · rng.ts · api.ts
```

---

**ORIA IS WATCHING.**
