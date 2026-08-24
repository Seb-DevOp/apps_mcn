# MCN — THE VAULT · la Descente (idle) + V1 + V2.1 + V2.2 + comptes + Mini App Farcaster

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

## La Descente — le jeu idle

Le cœur du jeu a changé. On ne joue plus une session quotidienne autour d'un
coffre : on possède un chat qui descend dans le Vault tout seul, et on décide de
ce qu'il porte et de ce qu'il devient.

**Cinq salles, un Gardien, cinq salles.** `LEVELS_PER_FLOOR = 6` : les positions 1 à 5
sont des ennemis ordinaires, la 6ᵉ est le Gardien de l'étage — sept fois plus
résistant, neuf fois plus rémunérateur, et il lâche toujours un équipement.

**Rien ne tourne sur un minuteur.** L'état est une fonction pure de
`(état, secondes écoulées)`, calculée à la lecture depuis `lastTickAt`. Lire
`/api/idle` *est* le tick — c'est pourquoi ce GET n'est délibérément pas
idempotent. Cette seule décision donne trois choses à la fois : la progression
hors-ligne sans code dédié, une horloge infalsifiable puisque c'est le serveur qui
la lit, et aucune tâche de fond à maintenir en vie sur un hébergement serverless.

**L'or ne tombe que des monstres tués.** Attendre n'est pas un revenu : un chat
bloqué doit redescendre farmer les salles qu'il sait battre, pas regarder le
compteur monter tout seul.

**Ce qui tombe va dans le sac.** Seul un emplacement *vide* se remplit tout seul —
un chat qui ne porte rien n'a pas de décision à prendre, et un nouveau joueur doit
voir ses six premières pièces apparaître sur lui. Après ça, choisir est le jeu.

### Les six emplacements, visibles sur le chat

Tête, épaules, torse, mains, jambes, bijou. Chaque pièce est **dessinée en SVG**,
pas importée : tous les packs d'assets libres proposant de l'équipement modulaire
sont du pixel-art humain, et en greffer un sur un Maine Coon peint donnerait
l'impression de deux jeux collés. Dessiner les pièces les rend cohérentes par
construction, sans licence, et un nouveau palier devient un `path` plutôt qu'une
commande à un illustrateur.

Cinq silhouettes par emplacement, choisies selon la profondeur où la pièce est
trouvée — bandeau, coiffe, heaume, heaume cornu, heaume couronné — teintées par la
rareté. Le chat **change de forme** en descendant, pas seulement de couleur.

L'ordre des calques fait tout : corps, puis armure, puis la collerette par-dessus
le col de l'armure, puis la tête. Une cuirasse glissée sous la crinière a l'air
portée ; la même peinte au-dessus a l'air d'un autocollant.

### Le chat peut perdre

Sans points de vie il n'y a pas de combat, seulement une minuterie déguisée :
regarder l'écran suffisait à gagner, et aucun achat ne faisait jamais la
différence entre passer et ne pas passer.

Le chat a donc une vie, les ennemis frappent, et un chat vaincu est ramené à la
**première salle de son étage**. L'étage record est conservé — on ne perd pas sa
progression, on perd le temps qu'il faut pour refaire le chemin.

La résolution reste en forme close, jamais pas à pas. Régénération et dégâts
forment un seul débit net : positif, le chat ne peut pas perdre ce combat ;
négatif, `temps avant chute = vie / débit`. Le plus petit des deux délais —
tuer ou tomber — décide du combat. C'est ce qui permet de résoudre douze heures
d'absence sans boucle par image.

**Les coups sont discrets à l'écran et continus dans les calculs.** La moyenne est
identique, mais un nombre qui tombe est un nombre que le joueur peut lire : les
dégâts montent au-dessus de qui les prend, l'or monte des pieds de l'ennemi, et
les deux barres se font face.

**L'écran nomme la cause du blocage** plutôt que de dire « trop fort » :
*Dégâts 81,3k/s · Vie 81,0k · Vitesse 2,4/s · Critique 32 % · Dég. crit ×3 · Double
22 %* se lit tout seul, et le
verdict dit quel achat débloque.

### Les courbes, mesurées et non devinées

`npm run balance` fait tourner le vrai moteur sur des heures simulées avec un
joueur volontairement bête — « j'achète la chose la moins chère que je peux
payer » — et imprime où tombent les murs. Trois enseignements y ont été trouvés,
qu'aucune lecture du code n'aurait donnés :

**Une amélioration additive ne rattrape jamais une exponentielle.** La vie des
ennemis est en `1,19^niveau` ; une amélioration à +4 % par niveau achetée n fois
donne un facteur linéaire en n, et n ne croît que comme le logarithme de l'or.
Résultat mesuré : étage 6 en six heures, 1551 défaites. La Ferveur et le Cuir
sont donc devenus **multiplicatifs et composés**.

**À croissance exactement équilibrée, la progression est linéaire pour toujours.**
Le temps par étage reste constant et le chat descend sans fin — mesuré : étage 713
en six heures. Il faut que la puissance du joueur croisse un peu *moins* vite que
le Vault, pour que chaque étage coûte plus que le précédent. Le rapport entre le
coût d'une amélioration et son effet est le seul réglage qui compte :
`effet ^ (ln croissance_or / ln croissance_coût)` doit rester sous la croissance
des ennemis.

**Une guérison achetable supprime la défaite.** Achetée sans limite elle finit
par dépasser n'importe quel dégât possible à n'importe quelle profondeur : le chat
devient immortel et la condition de perte disparaît en silence. La régénération est
donc fixée à 2 % de la vie totale et ne figure pas dans la boutique — elle suit ce
que le joueur a acheté en vie, sans jamais pouvoir le dépasser.

Courbe obtenue, joueur naïf : étage 10 à 14 min, étage 20 à 49 min, étage 25 à
2 h 10, étage 30 à 6 h 30 — 200 défaites réparties sur douze heures, et aucun
étage qui retienne le chat pour toujours.

### L'or ne tombe que des morts, et un Gardien soigne

Deux règles qui tiennent ensemble.

**Aucun revenu passif.** L'or vient des ennemis vaincus et de rien d'autre. Une
rente de présence rendait l'attente rentable : il suffisait de laisser l'écran
ouvert quelques minutes pour s'acheter la sortie de n'importe quel mur.

**Un Gardien vaincu rend 100 % de la vie.** C'est la récompense de l'étage.
Sans elle, chaque boss ouvrait l'étage suivant sur un chat déjà à moitié mort et
le mur tombait sur la salle *d'après* plutôt que sur le Gardien lui-même.

Retirer la rente ouvre une impasse qu'il faut fermer explicitement : un chat qui
meurt sur la première salle de son étage n'y tue rien, ne gagne donc rien, et
boucle indéfiniment sans moyen d'acheter sa sortie. **Tomber deux fois sans un
seul kill entre les deux fait redescendre d'un étage** — jusqu'à retrouver des
ennemis à sa portée. Le compteur démarre à un plutôt qu'à zéro, pour qu'un joueur
qui ouvre l'application pile sur une défaite ne soit pas rétrogradé pour avoir
regardé.

Effet mesuré du retrait de la rente : étage 43 → 35 en douze heures, et 130 → 245
défaites. C'est plus dur, et c'est le but.

### Ce qui reste de l'application

La Descente est le jeu. Tout ce qui l'entourait appartenait à un autre jeu et a
été supprimé : le hub Vault, le mini-jeu, le coffre quotidien, les séries, les
missions, l'Armurerie, la Forge, l'exploration, la galerie des rangs — routes,
API, moteurs, contenu et composants.

Il reste **trois écrans** :

| Écran | Ce qu'il fait |
| --- | --- |
| **Descente** | le combat et le sac, deux onglets d'un même jeu qui tourne |
| **Classement** | profondeur, Gardiens, fortune — trois tables lues sur `IdleProfile` |
| **Profil** | le chat, ses chiffres, le compte et ses moyens de connexion |

Le dictionnaire est passé de 404 à 189 clés, élagué par un script qui garde les
préfixes construits à l'exécution — `t(`idle.slot.${slot}`)` n'est pas une
chaîne littérale et une recherche naïve aurait supprimé les six emplacements.

**Le schéma n'est pas touché.** Les tables de l'ancien jeu ne reçoivent plus
d'écritures mais ne sont pas supprimées : une table vide ne coûte rien, alors
qu'un `DROP` est irréversible et mérite d'être une décision prise pour
elle-même plutôt qu'un effet de bord d'un changement de gameplay.

### Six statistiques, et une définition de « aussi forte »

Attaque, Points de Vie, Vitesse, Chance Critique, Dégâts Critiques, Double Coup.
Les dégâts par seconde sont un **produit**, pas une somme :

`dps = dégâts × vitesse × (1 + crit × (dégâts_crit − 1)) × (1 + double)`

ce qui donne un sens exact à « aucune plus forte qu'une autre ». Pour une
amélioration dont le niveau n multiplie son facteur par m et coûte `base·c^n`, le
multiplicateur qu'un budget G achète vaut `(G/base)^(ln m / ln c)`. **Cet exposant,
et rien d'autre**, décide de la force d'une amélioration sur le long terme : deux
améliorations sans plafond sont équivalentes exactement quand leurs `ln m / ln c`
coïncident.

| Statistique | Effet par niveau | Coût | Plafond | Exposant |
| --- | --- | --- | --- | --- |
| Attaque | ×1,10 dégâts | ×2,88 | — | 0,090 |
| Vitesse | ×1,06 attaques/s | ×1,91 | — | 0,090 |
| Dégâts Critiques | ×1,08 sur un crit | ×2,35 | — | 0,090 |
| Points de Vie | ×1,12 vie | ×1,46 | — | 0,299 |
| Double Coup | +2 % de coup en plus | ×1,55 | — | linéaire |
| Chance Critique | +1,5 % | ×1,27 | 100 % (niv. 64) | borné |

Attaque, Vitesse et Dégâts Critiques sont les trois offensives sans plafond et
partagent un exposant de 0,090 — dont la somme fait les 0,27 dont le rythme a
besoin. Ajouter une troisième exponentielle sans abaisser les trois aurait fait
*accélérer* la progression, et un idle dont les étages deviennent moins chers est
terminé.

**Points de Vie répond à une autre courbe** — les dégâts ennemis croissent en
1,152 par niveau, leur vie en 1,19 — et est calée sur celle-là : lui donner
l'exposant de l'Attaque laisserait le chat incapable de survivre à ce qu'il sait
déjà tuer.

**Une seule statistique s'arrête, et pas par choix.** La Chance Critique est une
probabilité : 100 % est de l'arithmétique, pas une décision de conception. Son
niveau maximum est exactement celui qui atteint la certitude, pour que rien ne
soit jamais vendu qui ne fasse rien.

**Le Double Coup dépasse volontiers la certitude** : au-delà de 100 %, chaque
point entier est un coup garanti de plus. 2,4 se lit « deux coups de plus, et 40 %
de chances d'un troisième ». Son effet est linéaire dans les niveaux achetés —
donc logarithmique dans l'or — ce qui le rend éternellement achetable sans
déranger la courbe que les trois exponentielles fixent.

`npm run balance` le vérifie plutôt que de l'affirmer. La sonde simule un joueur
qui achète à chaque instant ce qui rend le plus par pièce d'or, et rapporte la part
d'or allée à chacune. Verdict mesuré sur douze heures : **aucun piège — les six ont
été le meilleur achat à un moment**, l'or se répartit 24 / 39 / 36 % entre les trois
sans plafond, et les trois bornées sont saturées avant la vingtième minute.

Une mesure a changé la conception elle-même : avec des dégâts ennemis croissant en
1,17, **le mur de progression et le mur de mort étaient le même mur** — 1400
défaites en douze heures, une toutes les 25 secondes. Ramener la croissance des
dégâts à 1,152 sépare les deux : le chat ralentit avant de mourir, et les 130
défaites restantes tombent là où elles doivent, sur les Gardiens.

### Seize chambres, dessinées

Chaque étage a son décor, et ils tournent.

La photographie était la réponse évidente et la mauvaise : un jeu d'images assez
grand pour compter pèse des mégaoctets, demande des licences, et se retrouverait
derrière un chat dessiné à la main en donnant l'impression de deux jeux collés.
Ce sont donc **seize scènes en SVG** — quelques dizaines de formes chacune. Elles
ne coûtent rien à envoyer, elles sont faites de la même matière que le reste de
l'écran, et un jeu sans dernier étage peut les faire tourner indéfiniment.

Crypte, Cavités, Forge, Givre, Rayonnages, Frondaison, Abîme, Salle Dorée, Fange,
Géode, Ossuaire, Sanctuaire, Ruine, Tempête, Nécropole, Cœur du Vault.

La rotation seule rendrait l'étage 17 identique à l'étage 1, donc **chaque tour
complet décale la teinte et baisse la lumière**. Le Vault devient plus étrange et
plus sombre à mesure qu'on descend, sans dix-septième dessin. Le décalage est
borné : les étages profonds sont singuliers, pas illisibles.

Deux détails qui ne se voient que quand ils manquent. Les poussières qui flottent
tirent leur position de l'indice du thème et non de `Math.random` : un décor
aléatoire est une divergence d'hydratation qui attend son heure. Et le décor est
positionné, donc sans `z-index` explicite il se peindrait **par-dessus** les barres
de vie, qui elles ne le sont pas.

### Presque sans fin

Les plafonds arbitraires ont sauté. La Vitesse était additive et s'arrêtait à
5 coups par seconde ; elle est maintenant multiplicative et sans limite. Le Double
Coup s'arrêtait à 90 % ; il continue au-delà de la certitude.

Ce qui oblige à regarder ce que « sans limite » fait ailleurs :

**À mille attaques par seconde, un écran n'en montre que sept.** Au-delà d'environ
sept frappes par seconde, une frappe dessinée en représente plusieurs et porte
leurs dégâts ensemble. Sans ce regroupement la barre se viderait à une fraction du
rythme réel et la rejouabilité contredirait le serveur d'un ordre de grandeur au
lieu d'un arrondi. Au-delà de trois coups par frappe, les nombres fusionnent en un
seul portant son compte : `1,2M ×5`.

**Et à profondeur absurde, les deux côtés débordent.** Vie de l'ennemi et
puissance du chat croissent toutes deux exponentiellement ; passé environ l'étage
600 elles valent `Infinity` toutes les deux et leur rapport devient `NaN`. Le
moteur retombe alors sur le plancher de durée d'un combat plutôt que de produire
une sauvegarde cassée. C'est un horizon théorique — la sonde met vingt-quatre
heures à atteindre l'étage 32 — mais un jeu annoncé sans fin doit savoir ce qu'il
fait à sa propre fin.

### L'équipement redevient une décision

Trois choses manquaient pour que le système existe : des bonus qui distinguent
les pièces, un moment où on les regarde, et l'arrêt de l'équipement automatique.

**Des bonus sur les six mêmes statistiques que la boutique.** Une pièce peut
porter jusqu'à trois bonus — Attaque, Vie, Vitesse, Chance Critique, Dégâts
Critiques, Double Coup — selon sa rareté : aucun sur un commun, trois sur un
légendaire.

Ils ne sont **délibérément pas mis à l'échelle de l'étage**. Puissance et vitalité
croissent déjà ×1,75 par étage ; un pourcentage qui grandirait avec la profondeur
composerait deux fois et dépasserait la courbe ennemie en quelques étages. Comme
multiplicateur plat au-dessus d'une exponentielle, les bonus sont un plafond qu'on
approche en collectionnant — c'est exactement ce qu'une chasse doit être.

Ils s'additionnent entre pièces plutôt que de se multiplier : un set complet est
une somme que le joueur peut lire sur l'écran et prévoir, là où six facteurs
composés donneraient un chiffre que plus rien dans le jeu ne peut équilibrer.

**« Meilleur » se calcule maintenant, il ne se lit plus.** Avec des bonus en jeu,
une pièce plus faible portant +20 % de Vie bat facilement une pièce brute plus
forte, et seule la dérivation complète du chat le sait. `scoreWith()` dérive le
chat deux fois — avec et sans — et compare `puissance × vie`. C'est une
heuristique, elle est nommée comme telle, mais c'est **la même partout** : ce que le
bouton « Équiper le recommandé » optimise est exactement ce que la flèche verte à
côté d'un objet promet. Deux réponses différentes à la même question seraient pires
que n'importe laquelle des deux.

**Une carte de butin, pas une boîte de dialogue.** Le chat enchaîne plusieurs
ennemis par seconde ; une fenêtre qu'il faudrait fermer serait un mur toutes les
quelques secondes. La carte glisse au-dessus de l'arène, s'empile jusqu'à trois, et
se retire d'elle-même au bout de treize secondes. **L'ignorer est une réponse
valable** et vaut « garder » — rien n'est perdu à laisser une pièce dans le sac.
Trois boutons : Porter · Vendre (+or exact) · Garder.

Les trouvailles hors-ligne n'y passent jamais. Revenir de douze heures d'absence et
se voir tendre vingt-cinq cartes une par une n'est pas une récompense : le rapport
de retour les compte, le sac les garde.

Un détail qui ne se voit que quand il manque : le rapport d'un tick est renvoyé par
**chaque action** qui le suit, donc sans mémoire des identifiants déjà proposés,
vendre une pièce ferait réapparaître les deux autres du même tick.

### La Renaissance, ou pourquoi un idle a besoin d'un second arc

Un joueur a plafonné la Chance Critique en deux jours. Ce n'est pas que les gains
soient trop généreux — c'est qu'il n'y avait qu'un seul arc, et qu'un arc qui
décélère finit toujours par ressembler à une fin.

**Ralentir les gains a été écarté délibérément.** Le même contenu, plus lentement,
ajoute de l'attente et pas de la profondeur : le joueur ferait exactement les mêmes
choses en y passant plus de temps. C'est le seul levier qui coûte du plaisir sans
rien rendre.

Un chat a neuf vies. En dépenser une remet à zéro l'étage, l'or, les six
améliorations et tout l'équipement ; elle rapporte des **reliques**, qui ne
disparaissent jamais.

**Les reliques sont dues sur le record de profondeur, et sur rien d'autre.** Payer
par partie ferait de la renaissance à l'étage 15 une ferme, et une ferme est le
contraire d'une raison de descendre. L'écran le dit, plutôt que de laisser le
joueur le découvrir en étant déçu.

#### Deux erreurs symétriques, toutes deux mesurées

Le premier réglage donnait des reliques **polynomiales** en fonction de l'étage.
Sur sept jours simulés, la Renaissance rapportait exactement **un étage** — parce
que ce qu'une vie coûte croît de ×2,84 par étage pendant que ce qu'elle payait
croissait comme un carré. C'est le même piège que les améliorations additives du
début, sur un autre axe.

Le correctif évident — reliques exponentielles **et** effet composé — a produit
l'inverse : **étage 366 en 48 heures**. La raison est nette : des reliques en
`1,55^étage` donnent un nombre de niveaux linéaire en l'étage, et un effet composé
sur un compte linéaire achète une *fraction constante du record* à chaque vie —
donc le record devient géométrique.

La forme juste est **exponentielle dans ce qui est dû, additive dans ce que ça
fait**. Les reliques suivent `1,55^étage`, largement sous les 2,84 de la difficulté ;
leur effet est `1 + 0,15 × n` et non `1,15^n`. Chaque vie achète une avance qui
grandit lentement et ne devient jamais la partie entière.

Mesuré, joueur naïf qui renaît après quarante-cinq minutes sans nouveau record :

| | 48 h | 7 jours |
| --- | --- | --- |
| sans Renaissance | étage 41 | étage 46 |
| avec | **étage 50** | **étage 55** |

`npm run balance 168 norebirth` rejoue les mêmes heures sans le second arc, parce
que c'est la seule façon de savoir si le second arc mérite d'exister.

### Deux choses à faire avec ses mains

**Taper l'ennemi.** Chaque tape vaut deux coups ordinaires. Énorme dans les
premières minutes, quand le chat frappe une fois par seconde ; négligeable quand il
en est à vingt — ce qui est la bonne forme. Ça donne une raison d'ouvrir
l'application sans jamais devenir la raison de la garder ouverte, et ça ne peut pas
dépasser la courbe idle parce que c'est plafonné par la vitesse d'un pouce.

Les tapes sont **groupées** : une requête par tape ferait plusieurs appels par
seconde pour un seul doigt, un envoi toutes les demi-secondes fait les mêmes dégâts
pour une fraction du trafic. Le compte envoyé est une *prétention*, pas un fait —
le serveur le rogne au temps écoulé depuis la dernière tape, donc un script ne
gagne rien qu'un pouce rapide n'obtiendrait.

**Le Rugissement.** Une minute des dégâts du chat, d'un coup, toutes les trois
minutes. Une part de la production courante plutôt qu'un nombre fixe, pour qu'il
reste digne d'être pressé à n'importe quelle profondeur sans jamais être ce qui
libère un étage à lui seul.

Ni l'un ni l'autre ne tue quoi que ce soit directement : ils **blessent** l'ennemi
et laissent le tick suivant l'achever. Faire mourir l'ennemi ici demanderait une
seconde copie de la logique de récompense — or, deux copies d'un chemin de
récompense, c'est ainsi qu'un jeu finit par payer deux fois.

### Cinq marches, une par vie

Viser cinq renaissances impose que chacune rapporte un **système** plutôt qu'un
plus gros chiffre : une renaissance qui ne fait que multiplier est une corvée avec
une cérémonie autour.

L'exigence monte de douze étages par vie — 15, 27, 39, 51, 63. Sans ça le record
avance un peu, une vie est dépensée, et toute l'échelle est grimpée en deux jours,
soit l'inverse de l'étaler. Mesuré, la cinquième marche demande environ neuf jours
d'idle ininterrompu, et bien plus pour qui dort. L'exigence continue de monter
ensuite, donc les vies tardives restent rares — et elles continuent de payer des
reliques pour toujours : s'arrêter à cinq laisserait un seul arc qui décélère,
c'est-à-dire le problème que le second arc existe pour résoudre.

| Vie | Marche | Ce que ça change |
| --- | --- | --- |
| 1 | **Le Flair** | tout ce qui tombe sous une rareté choisie devient de l'or sur place |
| 2 | **Les Sceaux** | trois pièces portées de même rareté se renforcent, davantage si elles sont rares |
| 3 | **Le Souffle** | soin complet, et plus rien n'atteint le chat pendant quinze secondes |
| 4 | **Les Élites** | un ennemi sur onze revient difforme : six fois la vie, un butin d'une rareté supérieure |
| 5 | **La Meute** | un second chat, habillé du fond du sac, qui ajoute un tiers de ce qu'il vaut |

Quelques décisions qui ne se voient que quand elles manquent.

**Trois pièces, pas deux, pour un Sceau.** Deux raretés qui coïncident arrivent par
accident, et un bonus obtenu par accident n'apprend rien. À partir de trois, c'est
la première fois que le sac contredit le bouton « Équiper le recommandé » : garder
une pièce légèrement plus faible peut devenir juste.

**Le Souffle stocke des secondes dues, pas une date d'expiration.** Le résolveur de
tick travaille en durées écoulées et non en heure murale — comme tout le reste ici.
Sa fin est un événement au même titre qu'une mort : l'étape s'y arrête au lieu de
moyenner à travers un changement de taux, donc un bouclier qui expire au milieu
d'un combat est exact et non approché.

**Une Élite est tirée quand l'ennemi entre**, pas quand l'état est lu — sinon
rafraîchir la page serait un nouveau tirage. Et elle porte une couronne d'éclats :
six fois la vie qui arrive sans prévenir se lit comme un bug.

**La Meute vit dans la même table**, marquée par un préfixe sur l'emplacement porté
(`PACK:HEAD`). La garantie « une pièce par emplacement » du schéma couvre alors les
deux chats avec un seul index, sans seconde contrainte à tenir en phase. Elle se
bat avec les mêmes améliorations et les mêmes reliques — c'est le même joueur —
mais seul un tiers de ce que ça donne atteint le combat : un second chat entier
doublerait chaque nombre à l'écran et diviserait par deux le sens du premier.

### Huit raretés, dont deux qu'il faut mériter

Gris, vert, bleu, violet, orange, rouge, diamant — et au-dessus, le Souverain.

Les deux du haut **n'existent pas** pour un chat neuf. Les probabilités les
ouvrent à mesure que les vies s'accumulent : Diamant à partir de la deuxième
renaissance, Souverain à partir de la quatrième, et chaque vie ensuite décale
toute la distribution vers le haut en amincissant les communs.

C'est ce qui fait qu'une renaissance change ce à quoi le jeu **ressemble**, et pas
seulement la vitesse à laquelle ses nombres bougent. Un premier Diamant est un
événement plutôt qu'une lente dérive des probabilités — parce que son poids est
exactement zéro avant, et non « très faible ».

Un Souverain porte cinq bonus contre trois pour un Légendaire, et multiplie ses
chiffres par 8,4 contre 4,6. Le Sceau suit : six pièces souveraines assorties
valent nettement plus que six communes.

### La boutique

**Le Coffre.** Une pièce de l'étage où l'on se trouve, tirée sur ses *propres*
probabilités — celles que les vies ont ouvertes, pas une table séparée.

Il est facturé sur l'étage courant et non sur le record, et c'était un vrai écart
entre le commentaire et le code : facturer sur le record pendant que le coffre
donne une pièce de l'étage courant rendait la boutique inachetable juste après une
renaissance et gratuite juste avant. Le prix vaut environ trois minutes de l'étage
où l'on est, parce que l'or est multiplié par mille tous les huit étages — n'importe
quel prix fixe est inatteignable à l'étage cinq et offert à l'étage vingt-cinq.

**Un coffre sur dix est garanti**, à une rareté que les renaissances déterminent :
Épique, puis Légendaire à deux vies, Diamant à quatre. Le compteur est affiché en
dix pastilles dont la dixième porte la couleur promise — une promesse qu'on voit
approcher vaut mieux qu'une promesse écrite dans une description. Un tirage qui
peut être malchanceux quarante fois de suite n'est pas une boutique, c'est un
grief.

**Les pelages.** Huit robes, couleur seulement, gardées à travers chaque
renaissance : faire racheter la même couleur deux fois n'est pas un puits à or.
Chacune vaut environ dix fois la précédente, et comme l'or croît d'un facteur mille
tous les huit étages, une robe se débloque **en descendant** plutôt qu'en
économisant — la boutique a toujours exactement une chose presque abordable.

Une robe est cinq couleurs et rien d'autre : chaque tracé du chat les lit, donc une
nouvelle robe est une ligne dans une table plutôt qu'un second dessin à tenir en
phase avec le premier chaque fois qu'une pièce d'armure bouge. Et la vignette de la
boutique est **le chat lui-même** — une pastille de couleur ne montrerait pas ce
qu'une robe fait à la collerette, aux oreilles et aux yeux.

### Cinq classements, parce qu'il y a deux façons d'être profond

Depuis la Renaissance, « profond » veut dire deux choses différentes.

**Profondeur** est l'étage le plus bas qu'une seule vie ait atteint. **Distance**
est le nombre d'étages parcourus sur *toutes* les vies. Le premier récompense une
partie unique poussée très loin, le second une douzaine de vies dépensées — et ne
classer que le record aurait rendu chaque vie après la première invisible.

Mesuré sur des profils volontairement contrastés : un chat à l'étage 41 en une
seule vie finit **dernier** en Distance, pendant qu'un chat qui n'a jamais dépassé
l'étage 23 mais a dépensé neuf vies finit **premier**. Les deux tables classent
réellement des joueurs différents.

S'y ajoutent **Renaissances** (les vies dépensées — chacune était un record battu,
sinon elle n'aurait rien valu), **Gardiens** et **Fortune**.

Chaque ligne porte l'étage record et le nombre de vies sous son chiffre principal,
quel que soit le classement : le nombre de tête seul ne dit rien du genre de joueur
qui l'a produit.

Deux détails de langue que seul l'écran révèle. `étage 700` et `700 étages` sont
deux affirmations différentes — l'une est un lieu, l'autre une distance — et la
Distance réutilisait la formule de la Profondeur. Et `1 vies` : les deux compteurs
ont maintenant leur forme au singulier.

Le cumul vit dans `totalLevels`, incrémenté à chaque salle franchie et **jamais
remis à zéro par une renaissance**. C'est le seul nombre qui dise combien de Vault
un chat a réellement parcouru, là où le record ne dit que jusqu'où il est descendu
une fois.

### Le sac

Un onglet à part, parce que trier n'est pas se battre — et le combat continue côté
serveur pendant qu'on trie, donc revenir à l'arène doit être instantané plutôt
qu'une navigation.

On y voit le chat en grand avec ce qu'il porte, un point vert sur chaque
emplacement où le sac contient mieux, et deux boutons qui remplacent cent tapotements :

- **Équiper le recommandé** — met le meilleur de chaque emplacement d'un coup. La
  comparaison se fait sur la puissance seule, et c'est suffisant : dans un même
  emplacement, puissance et vitalité sont générées depuis le même étage et la même
  rareté, elles ne peuvent donc pas désigner des gagnants différents.
- **Vendre sous [rareté]** — une vente groupée par seuil, avec le nombre d'objets
  et l'or exact avant de cliquer. Les seuils s'arrêtent à Épique : « vendre sous
  Mythique » n'est que « tout vendre » déguisé, et ce bouton existe déjà.

### Les objets sont générés, pas catalogués

Un jeu idle n'a pas de dernier étage, donc un catalogue figé finirait par
s'épuiser. `itemStats(slot, floor, rarity)` dérive la pièce de ses trois
coordonnées : l'étage 400 est aussi meublé que l'étage 4, et aucun butin ne peut
se retrouver hors de proportion avec ses voisins par accident.

Le français porte le genre et le nombre sur l'adjectif, donc un nom ne peut pas se
fabriquer par concaténation : « Bandes Usé » est faux là où « Bandes Usées » est
juste. Chaque nom français voyage avec son accord, et le qualificatif choisit la
forme correspondante. L'anglais n'a besoin de rien de tout cela et garde une liste
simple.

### Ce que l'écran prédit, et ce qu'il ne peut pas inventer

Le client simule les secondes entre deux lectures avec exactement les mêmes règles
que le serveur, pour que la barre de vie bouge à soixante images par seconde
plutôt que par sauts de dix secondes. Puis il jette sa prédiction dès que la vérité
arrive. Rien dans le navigateur ne peut accorder une récompense : il peut
seulement se tromper pendant dix secondes.

**La Descente est l'écran d'arrivée** après connexion, et la première entrée de la
barre de navigation. Le hub Vault, les missions, l'Armurerie, la Forge et le
mini-jeu restent en place autour d'elle — le staking est une mécanique, le jeu est
le produit.

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
