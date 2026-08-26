# BetterShotgun

Extension Chrome pour [shotgun.live](https://shotgun.live)

## Ce qu'elle ajoute

**Sur une page d'événement**, elle resserre la page au lieu d'ajouter une
fenêtre par-dessus. Sur un événement réel, la page passe de 3 874 à 3 089 px :

- la bannière descend de 412 à 285 px, l'affiche est réduite sans être rognée ;
- une case de billet passe de 240 à 96 px, son descriptif tient sur une ligne
  et se déplie au clic ;
- le descriptif de la soirée et le line-up sont repliés, les organisateurs
  passent côte à côte ;
- la carte du lieu est reprise et rendue lisible : zoom utile, marqueur, et des
  boutons pour zoomer.

Sur un **lieu non divulgué**, Shotgun floute sa carte et la dézoome. Le flou est
du CSS et la coordonnée est publiée en clair dans les données de la page :
l'extension la rend simplement lisible, sans rien deviner. Elle ne prétend pas
qu'il s'agit de l'adresse, parce que rien ne le dit.

**Sur l'accueil, la recherche, et les pages de ville, de salle ou d'artiste**,
une loupe apparaît dans l'en-tête, à droite de la barre de recherche. Une page
ville n'affiche que douze événements sur deux jours et ne charge rien quand tu
fais défiler ; ce bouton récupère l'agenda entier en une requête et l'affiche
en grille dense :

- **plusieurs villes à la fois** : l'agenda s'ouvre sur la ville de la page, et
  sur l'accueil il s'ouvre vide, à toi de composer. Les villes s'ajoutent au
  sélecteur et se chargent au fur et à mesure, sans attendre les autres ;
- recherche instantanée sur le titre, la salle et le genre ;
- filtres ce soir / demain / week-end / 7 jours, et un curseur de prix ;
- les douze genres les plus présents, cumulables ;
- tri par date ou par prix, grille d'affiches ou liste dense ;
- les filtres se replient derrière un bouton, d'emblée sur écran étroit ;
- au clavier : `/` chercher, `↑` `↓` parcourir, `Entrée` ouvrir, `Échap` fermer.

Le prix affiché est celui des cartes Shotgun, c'est-à-dire le tarif le plus bas
encore ouvert.

## Ce qu'elle envoie

Rien à personne. Elle lit les données que le serveur envoie déjà à chaque
visiteur, et sa seule requête va sur shotgun.live, pour l'agenda d'une ville
quand tu ouvres la vue. Aucun appel à un tiers, aucune requête au chargement
d'une page.

## Limites

Les transformations des pages d'événement reposent sur le balisage de Shotgun,
qu'aucun attribut stable ne désigne : titre, bloc d'infos, affiche, cases de
billets, carte, line-up, organisateurs. Un changement de gabarit chez eux
cassera ce qu'on voit, pas un bonus discret.

Chaque transformation est isolée et annulable : l'échec de l'une n'empêche pas
les autres, et le démontage restaure les styles d'origine. L'hydratation de
Shotgun échoue sur certaines fiches et fait re-rendre toute la page ; dans ce
cas la passe est reposée, quatre fois au plus.

<img width="1884" height="50%" alt="image" src="https://github.com/user-attachments/assets/102caded-2a1e-49fc-b9f2-ebd2b65c5aae" />


<table align="center">
  <tr>
    <th align="center">Avant</th>
    <th align="center">Après</th>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="https://github.com/user-attachments/assets/736b680b-9093-49a6-b4cf-f7b1f3269582" alt="Démo Avant" width="100%">
    </td>
    <td align="center" width="50%">
      <img src="https://github.com/user-attachments/assets/f39b7b16-a0da-438a-b1fb-5aa306e82260" alt="Démo Après" width="100%">
    </td>
  </tr>
</table>

## Installation

1. Télécharge ce dossier.
2. Ouvre `chrome://extensions` et active le **Mode développeur**.
3. **Charger l'extension non empaquetée**, puis choisis le dossier.

Après chaque rechargement de l'extension, recharge aussi les onglets Shotgun
ouverts : Chrome n'injecte ses scripts qu'au chargement d'une page.
