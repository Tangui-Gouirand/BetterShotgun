# BetterShotgun

Extension Chrome pour [shotgun.live](https://shotgun.live). Elle travaille dans
la page : rien à cliquer dans la barre d'outils.

## Ce qu'elle ajoute

**Sur une page d'événement**, une carte en bas à gauche : les coordonnées GPS,
un bouton Maps, et une vérification d'adresse par OpenStreetMap à la demande.
Shotgun affiche déjà la salle et l'adresse, la carte ne les répète pas.

Si le lieu n'est pas divulgué, elle le dit et donne ce qu'on peut savoir : la
ville, le code postal, et par quel canal l'organisateur enverra l'adresse
(Telegram, Instagram, ou une phrase de la description du type « Adresse envoyée
par mail le jour J »).

La croix replie la carte sur un petit bouton, au même endroit, qui la rouvre.

**Sur une page de ville, de salle ou d'artiste**, un bouton **Agenda complet**
en bas à droite. Une page ville n'affiche que douze événements sur deux jours et
ne charge rien quand tu fais défiler ; ce bouton récupère l'agenda entier en une
requête — 286 événements pour Aix-Marseille — et l'affiche en liste dense :

- recherche instantanée sur le titre, la salle et le genre ;
- filtres ce soir / demain / week-end / 7 jours, et par prix ;
- les douze genres les plus présents, cumulables ;
- tri par date ou par prix, liste dense ou grille d'affiches ;
- au clavier : `/` chercher, `↑` `↓` parcourir, `Entrée` ouvrir, `Échap` fermer.

Le prix affiché est celui des cartes Shotgun, c'est-à-dire le tarif le plus bas
encore ouvert. Rien ne garantit qu'il restera au moment d'acheter.

## Installation

1. Télécharge ce dossier.
2. Ouvre `chrome://extensions` et active le **Mode développeur**.
3. **Charger l'extension non empaquetée**, puis choisis le dossier.

Après chaque rechargement de l'extension, recharge aussi les onglets Shotgun
ouverts : Chrome n'injecte ses scripts qu'au chargement d'une page.

## Ce qu'elle lit, ce qu'elle envoie

Elle lit les données que le serveur envoie déjà à chaque visiteur. Elle ne
contourne rien et n'accède à rien qui soit réservé aux acheteurs de billets.

Aucune requête au chargement d'une page. L'agenda est demandé à Shotgun quand tu
ouvres la vue. Le seul appel à un tiers est **Vérifier (OSM)**, sur ton clic, et
jamais pour un lieu secret — sur un point générique de centre-ville, il
renverrait une adresse crédible et fausse.

Les scripts s'exécutent sur toutes les pages du site, faute de mieux : Chrome
n'injecte qu'au chargement d'un document, et Shotgun change de page sans en
recharger un. Hors des pages d'événement, de ville, de salle, d'artiste et de
festival, ils n'affichent rien.

## Limites

- L'adresse d'un lieu secret n'est nulle part dans la page. Aucun outil ne peut
  la sortir de là, et l'extension ne l'invente pas.
- Les cartes de liste n'ont aucun attribut stable : si Shotgun change ses
  gabarits, la lecture du titre, de la salle ou du prix s'arrête.
- Mesures d'août 2026.

## Fichiers

| | |
|---|---|
| `event.js` | Lit le lieu d'une page d'événement |
| `quickview.js` | Charte graphique et construction de l'agenda |
| `boot.js` | Décide quoi afficher, suit les changements de page |
| `popup.js` · `popup.html` | Dit si l'interface tourne dans l'onglet, et l'y met sinon |
| `tools/make-icons.js` | Régénère `icons/` : `node tools/make-icons.js icons` |

Chaque élément vit dans son propre Shadow DOM accroché à `<html>`, hors du
conteneur React : Shotgun peut se redessiner sans effacer l'interface, et aucun
style ne fuit dans un sens ou dans l'autre.
