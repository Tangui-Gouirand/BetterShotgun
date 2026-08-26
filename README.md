# BetterShotgun

Extension Chrome pour [shotgun.live](https://shotgun.live)

## Ce qu'elle ajoute

**Sur une page d'événement**, une carte en bas à gauche : les coordonnées GPS,
un bouton Maps, et une vérification d'adresse par OpenStreetMap à la demande.
Shotgun affiche déjà la salle et l'adresse, la carte ne les répète pas.

Si le lieu n'est pas divulgué, elle le dit et donne ce qu'on peut savoir : la
ville, le code postal, et par quel canal l'organisateur enverra l'adresse
(Telegram, Instagram, ou une phrase de la description du type « Adresse envoyée
par mail le jour J »).

La croix replie la carte sur un petit bouton, au même endroit, qui la rouvre.

**Sur l'accueil et sur une page de ville, de salle ou d'artiste**, un bouton
**BetterShotgun** en bas à droite. Une page ville n'affiche que douze
événements sur deux jours et ne charge rien quand tu fais défiler ; ce bouton
récupère l'agenda entier en une requête et l'affiche en liste dense :

- **plusieurs villes à la fois** : l'agenda s'ouvre sur la ville de la page, et
  sur l'accueil il s'ouvre vide, à toi de composer. Les villes s'ajoutent au
  sélecteur et se chargent au fur et à mesure, sans attendre les autres ;
- recherche instantanée sur le titre, la salle et le genre ;
- filtres ce soir / demain / week-end / 7 jours, et un curseur de prix ;
- les douze genres les plus présents, cumulables ;
- tri par date ou par prix, liste dense ou grille d'affiches ;
- au clavier : `/` chercher, `↑` `↓` parcourir, `Entrée` ouvrir, `Échap` fermer.

Le prix affiché est celui des cartes Shotgun, c'est-à-dire le tarif le plus bas
encore ouvert.

<table align="center">
  <tr>
    <th align="center">Avant</th>
    <th align="center">Après</th>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="https://github.com/user-attachments/assets/d98a05ea-e78e-44d4-8ca8-c97273168698" alt="Démo Avant" width="100%">
    </td>
    <td align="center" width="50%">
      <img src="https://github.com/user-attachments/assets/cff97aa4-7f15-46af-b4df-d6a7181948fb" alt="Démo Après" width="100%">
    </td>
  </tr>
</table>



## Installation

1. Télécharge ce dossier.
2. Ouvre `chrome://extensions` et active le **Mode développeur**.
3. **Charger l'extension non empaquetée**, puis choisis le dossier.

Après chaque rechargement de l'extension, recharge aussi les onglets Shotgun
ouverts : Chrome n'injecte ses scripts qu'au chargement d'une page.
