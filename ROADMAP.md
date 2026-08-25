# Axes d'évolution

Relevé fait le 25 août 2026 sur la zone `shotgun.live/fr/cities/aix-marseille`
(286 événements, du 25 août 2026 au 16 avril 2027) et sur les pages
d'événement, de salle et d'organisateur correspondantes.

Chaque axe indique **ce qu'il affiche**, **d'où vient la donnée**, **ce qu'il
coûte en permissions** et **ce qui peut le casser**. Les axes sont classés par
coût croissant, parce que c'est ce coût qui décide de ce qui est faisable sans
changer la nature de l'extension.

---

## Livré · Vue rapide de l'agenda

`browse.js`, injecté à la demande depuis le popup sur une page de ville, de
salle, d'artiste ou de festival.

Le problème : une page ville n'affiche que **12 événements sur deux jours**, en
affiches pleine largeur, et ne charge pas la suite au défilement. Voir le
week-end suivant demande de repasser par le sélecteur de dates.

La vue rapide charge **tout l'agenda de la ville en une requête** — 286
événements en ~2 s — et l'affiche en liste dense : recherche instantanée,
filtres date / prix / genre, tri par prix, bascule liste ↔ affiches,
navigation au clavier.

- **Donnée** : les cartes déjà rendues côté serveur, plus `?page=30` sur les
  pages ville, qui renvoie l'agenda complet au lieu des deux jours par défaut.
- **Permissions** : aucune nouvelle. `activeTab` + `scripting` suffisent, et
  l'extension reste activée au seul clic sur son icône.
- **Fragilité** : moyenne. Le repérage du titre, de la salle et du prix
  s'appuie sur la structure des cartes (premier `<p>`, `<time datetime>`,
  `<span>` sans classe) — Shotgun n'expose aucun attribut stable. Un
  changement de gabarit fait tomber le champ concerné, pas la vue entière.

---

## Coût nul · à partir des données déjà lues

Ces trois axes n'ajoutent ni permission ni requête réseau : tout est déjà dans
le JSON-LD que `content.js` parcourt.

### 1. Panneau des tarifs restants

Le prix affiché sur une carte est le **plus bas encore ouvert**, ce qui est
trompeur : sur `special-guest-at-baby-club`, la carte annonce 5,99 € alors que
le palier suivant est à 9,99 € ; sur `pop-life-sb-8`, la carte annonce 12 €
et la catégorie gratuite est déjà épuisée.

Afficher les catégories telles quelles : nom, prix, et état réel.

- **Donnée** : `offers[]` du JSON-LD — `name`, `price`, `validFrom`, et
  `availability` qui vaut `InStock`, `LimitedAvailability` ou `SoldOut`.
  `LimitedAvailability` donne un badge « presque complet » que le site
  n'affiche nulle part sur les listes.
- **Fragilité** : faible. C'est du schema.org standard.

### 2. Export calendrier (.ics)

Un bouton qui produit un fichier `.ics` avec titre, début, fin, lieu et lien.
Le fichier est construit en mémoire (`Blob` + `<a download>`), donc **sans la
permission `downloads`**.

- **Donnée** : `startDate`, `endDate`, `location`, `name`, `url`.
- **Fragilité** : faible. Sur un lieu non divulgué, écrire la ville et non une
  adresse — même règle que le reste de l'extension.

### 3. Line-up cliquable

`performer[]` liste les artistes avec leur page Shotgun. Les afficher en liens
évite de fouiller la description.

- **Fragilité** : faible.

---

## Une requête sur shotgun.live · `host_permissions` déjà accordée

### 4. Lieux déjà utilisés par un organisateur

**L'axe qui prolonge vraiment la fonction actuelle.** Aujourd'hui l'extension
s'arrête net sur un lieu secret. Or `organizer.url` est déjà dans le JSON-LD
lu, et la page de l'organisateur liste ses événements passés — avec leurs
adresses publiques quand elles l'étaient.

Vérifié sur `kumquat`, organisateur d'un des deux événements secrets
d'Aix-Marseille : sa page liste 4 soirées, dont deux à adresse publique
(Citadelle de Marseille, Yuzu Record Bar).

Ce n'est **pas** une prédiction d'adresse. C'est un fait publié : « cet
organisateur a déjà fait jouer ici ». Le libellé doit rester factuel — *lieux
déjà utilisés*, jamais *l'adresse est probablement*. Déduire une adresse d'un
historique reviendrait à l'inventer, ce que le README refuse explicitement.

- **Donnée** : `organizer.url` → une requête sur `/<langue>/venues/<slug>`,
  puis les JSON-LD des événements listés.
- **Permissions** : aucune nouvelle. `https://shotgun.live/*` est déjà
  déclarée. Aucune donnée ne sort du site.
- **Fragilité** : faible côté données, moyenne côté coût : une page
  d'organisateur = 1 requête, plus 1 par événement dont on veut l'adresse.
  À plafonner (5 événements) et à mettre en cache comme le géocodage.
- **Vie privée** : à documenter dans le README, puisque l'extension émettrait
  une requête qui n'existait pas — vers shotgun.live uniquement.

### 5. État réel des places sur la vue rapide

Les cartes de liste ne signalent quasiment jamais un événement complet : 3 sur
286. L'information est sur la page de l'événement (`availability`). Enrichir
les événements **visibles après filtrage** — pas les 286 — coûte une requête
par événement.

- **Fragilité** : faible, mais à cadencer (comme Nominatim) et à mettre en
  cache. Ne charger que sur demande explicite, via un bouton.

### 6. Carte des soirées filtrées

Les coordonnées sont sur la page de l'événement, pas sur la carte de liste :
même coût que l'axe 5. Une carte est utile surtout sur un filtre resserré
(« ce soir », « gratuit »), là où il reste une dizaine d'événements.

- **Point ouvert** : afficher une carte demande un fond de plan. Une image
  tuilée externe ferait sortir la position de l'utilisateur du périmètre
  actuel. Une liste triée par distance, elle, ne coûte rien de plus.

---

## Change l'architecture · décision à prendre

Ces axes sont hors de ce qui a été livré parce qu'ils reviennent sur une
promesse du README : *« L'extension ne s'active qu'au clic sur son icône. »*

### 7. Bouton flottant permanent sur les pages de liste

Un `content_scripts` déclaré avec `matches: https://shotgun.live/*` afficherait
la vue rapide sans passer par le popup — un clic de moins.

- **Coût** : l'extension s'exécuterait sur **chaque** page Shotgun visitée,
  qu'on s'en serve ou non. La ligne du README saute et la section « vie
  privée » est à réécrire.
- **Compromis possible** : restreindre `matches` aux seules pages de liste
  (`/*/cities/*`, `/*/venues/*`, `/*/artists/*`).

### 8. Veille : remise en vente, baisse de prix, nouvel événement suivi

Être prévenu qu'une soirée complète a des places rendues, ou qu'un organisateur
suivi annonce une date.

- **Coût** : service worker + `chrome.alarms` + `chrome.notifications`, donc
  des requêtes en arrière-plan sur shotgun.live sans que l'utilisateur soit sur
  le site. C'est un changement de nature — passer d'un lecteur de page à un
  agent qui interroge le site tout seul.
- **À trancher avant d'écrire la moindre ligne.**

### 9. Favoris et masquage

Épingler des événements, masquer un organisateur, mémoriser les filtres de la
vue rapide.

- **Coût** : `storage` est déjà déclarée. Léger, mais crée un état persistant
  côté utilisateur qu'il faut pouvoir effacer.

---

## Écarté

**Deviner l'adresse d'un lieu secret.** Ni par géocodage inverse des
coordonnées génériques, ni par déduction depuis l'historique d'un organisateur.
Les deux produisent une adresse plausible et fausse.

**Frais de réservation.** Aucune donnée publique de la page ne permet d'établir
la règle : le JSON-LD ne porte que le prix facial, et vérifier demanderait
d'aller jusqu'au tunnel de paiement. Tant que la règle n'est pas établie sur
des données publiques, afficher un « prix réel » calculé serait une invention.
Axe spéculatif, non retenu.

**Tout contournement.** L'extension lit ce que le serveur envoie déjà à chaque
visiteur, et rien d'autre.
