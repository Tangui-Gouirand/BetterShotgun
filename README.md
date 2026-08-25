# Shotgun

Extension Chrome pour [shotgun.live](https://shotgun.live).

Sur une page d'événement, elle affiche le lieu : nom de la salle, adresse, code
postal, coordonnées GPS, lien Google Maps.

Sur une page de ville, de salle ou d'artiste, elle ouvre une **vue rapide** :
tout l'agenda chargé d'un coup, en liste dense et filtrable.

Elle lit les données que le serveur envoie déjà à chaque visiteur. Elle ne
contourne aucune protection et n'accède à rien qui soit réservé aux acheteurs
de billets.

Les autres pistes explorées : [ROADMAP.md](ROADMAP.md).

## Installation

1. Télécharge ce dossier sur ta machine.
2. Ouvre `chrome://extensions`.
3. Active le **Mode développeur**, en haut à droite.
4. Clique sur **Charger l'extension non empaquetée**, puis sélectionne le
   dossier.

## Utilisation · vue rapide

Ouvre une page de ville (`.../cities/aix-marseille`), de salle, d'artiste ou de
festival. Clique sur l'icône, puis sur **Ouvrir la vue rapide**.

Par défaut, une page ville te montre douze événements sur deux jours, en
affiches pleine largeur, et ne charge pas la suite quand tu fais défiler. La vue
rapide récupère l'agenda entier en une requête (286 événements pour
Aix-Marseille en août 2026, jusqu'en avril 2027) et l'affiche en liste dense.

| | |
|---|---|
| Recherche | Titre, salle et genre à la fois. Tu peux mettre les mots dans le désordre : « baby techno » trouve la techno au Baby Club |
| Dates | Ce soir, demain, week-end, 7 jours. Une soirée qui commence à 1 h compte pour la nuit de la veille |
| Prix | Gratuit, ≤ 10 €, ≤ 20 €, ≤ 35 € |
| Genres | Les douze genres les plus fréquents dans l'agenda chargé, cumulables |
| Tri | Par date, ou par prix croissant / décroissant |
| Affichage | Liste dense, ou grille d'affiches |
| Clavier | `/` rechercher · `↑` `↓` (ou `j` / `k`) parcourir · `Entrée` ouvrir · `Échap` fermer |

Le prix vient de la carte Shotgun, donc c'est le tarif le plus bas encore
ouvert. Rien ne garantit qu'il restera au moment d'acheter : sur une soirée du
Baby Club, la carte annonce 5,99 € alors que le palier suivant est à 9,99 €.

## Utilisation · lieu d'un événement

Ouvre une page d'événement (`https://shotgun.live/<langue>/events/<slug>`) puis
clique sur l'icône de l'extension.

**Lieu public.** Nom de la salle, adresse complète, code postal, coordonnées
avec bouton de copie, lien Google Maps. L'extension interroge OpenStreetMap pour
une adresse de contrôle, qui confirme le point.

**Lieu secret.** Un avertissement, la ville annoncée, les coordonnées publiées
et le lien Maps. En dessous, l'extension indique par quel canal l'organisateur
communiquera l'adresse (Telegram, Instagram) et remonte les indices de
localisation trouvés dans la description, du type « Nearest tram stop:
Landsberger Allee/Rhinstraße ».

**Aucune donnée.** Un message explicite quand la page ne contient aucune
information géographique.

## Les soirées « Lieu secret »

**Ni cette extension ni aucun autre outil ne peut révéler leur adresse depuis la
page** : Shotgun ne la publie pas.

Sur 254 événements relevés en août 2026, les 245 lieux publics affichent tous
une adresse complète. Les 9 marqués « Lieu secret » n'en affichent aucune. À la
place, Shotgun envoie un point générique de la ville, le même d'un événement à
l'autre : deux soirées berlinoises sans rapport partagent les coordonnées du
centre de Berlin.

Un géocodage inverse sur ce point te renverrait une adresse berlinoise crédible
et fausse, autrement dit un lieu inventé. L'extension s'en abstient, et te dit
pourquoi.

L'adresse finit par arriver. L'organisateur l'envoie aux détenteurs de billets
quelques heures avant, par Telegram ou Instagram. L'extension repère ce canal
dans la description pour t'éviter de la relire en entier.

## Permissions et vie privée

| Permission | Usage |
|---|---|
| `activeTab` + `scripting` | Lire la page ouverte, au clic uniquement |
| `storage` | Mémoriser les adresses déjà consultées (30 jours) |
| `https://shotgun.live/*` | Accéder à la page d'événement et charger l'agenda complet d'une ville |
| `https://nominatim.openstreetmap.org/*` | Convertir des coordonnées en adresse |

L'extension ne s'active qu'au clic sur son icône. La vue rapide ne demande
aucune permission supplémentaire : sa seule requête part vers shotgun.live, sur
la page de ville que tu as déjà ouverte. Rien d'autre ne sort de ta machine, à
part les coordonnées envoyées à OpenStreetMap pour les lieux publics. Le cache
reste chez toi et ne contient que des couples « coordonnées → adresse ».

## Structure

| Fichier | Rôle |
|---|---|
| `content.js` | Lit le JSON-LD d'une page d'événement, en extrait le lieu, détecte les lieux non divulgués |
| `browse.js` | Charge l'agenda et construit la vue rapide dans un Shadow DOM |
| `popup.js` | Aiguille selon la page ouverte, affiche le lieu ou lance la vue rapide |
| `popup.html` | Styles et icônes du popup |

`content.js` et `browse.js` ne sont jamais déclarés dans le manifeste :
`popup.js` les injecte au clic, ce qui évite le cas où l'onglet était déjà
ouvert au moment de l'installation.

## En cas de problème

**« Lecture de la page impossible »** : recharge la page d'événement, puis
clique à nouveau sur l'icône.

**« Service d'adresses momentanément saturé »** : OpenStreetMap limite le nombre
de requêtes, attends quelques secondes. Les coordonnées et le lien Maps restent
affichés.

## Limites connues

- L'adresse de contrôle OpenStreetMap correspond au point indiqué. Il peut
  différer de l'entrée du club, quand celle-ci se trouve en retrait de la rue.
- Shotgun peut changer la structure de ses pages, et la lecture s'arrête alors.
  La vue rapide y est plus exposée que le révélateur de lieu : les cartes de
  liste n'exposent aucun attribut stable, seule leur structure permet d'y lire le
  titre, la salle et le prix.
- Shotgun ne marque « complet » que 3 cartes de liste sur 286 (août 2026). La
  vue rapide reprend ce qu'affiche la page, elle rate donc les mêmes.
- Mesures d'août 2026. Shotgun peut modifier à tout moment ce qu'il publie.
