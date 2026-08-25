# Shotgun

Extension Chrome pour [shotgun.live](https://shotgun.live). Tout se passe dans
la page : il n'y a rien à cliquer dans la barre d'outils.

Sur une page d'événement, une carte apparaît en bas à gauche avec les
coordonnées GPS, un lien Maps et, pour un lieu non divulgué, par quel canal
l'organisateur enverra l'adresse.

Sur une page de ville, de salle ou d'artiste, un bouton **Agenda complet**
apparaît en bas à droite : tout l'agenda chargé d'un coup, en liste dense et
filtrable.

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

## Utilisation · agenda complet

Ouvre une page de ville (`.../cities/aix-marseille`), de salle, d'artiste ou de
festival. Le bouton **Agenda complet** attend en bas à droite.

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

Ouvre une page d'événement (`https://shotgun.live/<langue>/events/<slug>`). La
carte apparaît seule, en bas à gauche. La croix la referme.

**Lieu public.** Shotgun affiche déjà la salle et l'adresse : la carte ne les
répète pas. Elle ajoute ce qui manque, les coordonnées avec bouton de copie et
le lien Maps. **Vérifier (OSM)** demande à OpenStreetMap l'adresse de ce point
précis, pour confirmer.

**Lieu secret.** La ville, le code postal quand il existe, les coordonnées
publiées et le lien Maps. En dessous, la carte indique par quel canal
l'organisateur enverra l'adresse (Telegram, Instagram, ou une phrase de la
description du type « Adresse envoyée par mail le jour J ») et remonte les
indices de localisation, du type « Nearest tram stop: Landsberger
Allee/Rhinstraße ».

**Aucune donnée.** Rien ne s'affiche quand la page ne contient aucune
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
| `https://shotgun.live/*` | Exécuter les scripts sur les pages Shotgun, et charger l'agenda complet d'une ville |
| `storage` | Mémoriser les adresses déjà consultées (30 jours) |
| `https://nominatim.openstreetmap.org/*` | Convertir des coordonnées en adresse, à ta demande |
| `activeTab` + `scripting` | Le popup de secours, quand un onglet était ouvert avant l'installation |

Les scripts tournent sur **toutes** les pages de shotgun.live. C'est le prix de
l'injection directe : Chrome n'injecte un script qu'au chargement d'un
document, et Shotgun change de page sans en recharger un seul. Un `matches`
limité aux pages de ville laisserait l'extension muette dès que tu navigues
depuis l'accueil.

Ce qu'ils font sur les autres pages : rien. L'affichage est décidé à partir du
chemin, et hors des pages d'événement, de ville, de salle, d'artiste et de
festival, aucune surface n'est créée.

Aucune requête ne part au chargement. L'agenda complet est demandé à Shotgun
quand tu ouvres la vue, pas avant. Le seul appel à un tiers est **Vérifier
(OSM)**, sur ton clic, et jamais pour un lieu secret. Le cache reste sur ta
machine et ne contient que des couples « coordonnées → adresse ».

## Structure

| Fichier | Rôle |
|---|---|
| `event.js` | Lit le JSON-LD d'une page d'événement, en extrait le lieu, détecte les lieux non divulgués |
| `quickview.js` | Charte graphique, lecture des cartes de liste, construction de l'agenda |
| `boot.js` | Décide quoi afficher selon le chemin, suit les changements de page, dessine la carte lieu et le bouton |
| `popup.js` / `popup.html` | Le popup de secours |

Chaque surface vit dans son propre Shadow DOM accroché à `<html>`, hors du
conteneur React. Shotgun peut donc rendre et re-rendre ce qu'il veut sans
effacer l'interface, et sans qu'aucun style ne fuie dans un sens ou dans
l'autre.

## En cas de problème

**Rien n'apparaît dans la page** : l'onglet était ouvert avant l'installation,
Chrome n'y a donc injecté aucun script. Recharge la page. Le popup de
l'extension fait le travail en attendant.

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
