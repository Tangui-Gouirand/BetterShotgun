# Shotgun · Révélateur de lieu

Extension Chrome qui affiche le lieu d'un événement [shotgun.live](https://shotgun.live) :
nom de la salle, adresse, code postal, coordonnées GPS et lien direct vers
Google Maps, sans quitter la page.

Elle lit les données que le serveur envoie déjà à chaque visiteur. Elle ne
contourne aucune protection et n'accède à rien qui soit réservé aux acheteurs
de billets.

## Installation

1. Télécharger ce dossier sur ta machine.
2. Ouvrir `chrome://extensions`.
3. Activer le **Mode développeur**, en haut à droite.
4. Cliquer sur **Charger l'extension non empaquetée** et sélectionner le
   dossier.

## Utilisation

Ouvre une page d'événement (`https://shotgun.live/<langue>/events/<slug>`) puis
clique sur l'icône de l'extension.

**Lieu public.** Nom de la salle, adresse complète, code postal, coordonnées
avec bouton de copie, lien Google Maps. Une adresse de contrôle vient
d'OpenStreetMap pour confirmer le point.

**Lieu secret.** Un avertissement, la ville annoncée, les coordonnées publiées
et le lien Maps. En dessous, l'extension affiche par quel canal l'organisateur
communiquera l'adresse (Telegram, Instagram) et les indices de localisation
trouvés dans la description, du type « Nearest tram stop: Landsberger
Allee/Rhinstraße ».

**Aucune donnée.** Un message explicite quand la page ne contient pas
d'information géographique.

## Les soirées « Lieu secret »

**L'extension ne peut pas révéler leur adresse, et aucun outil ne le peut
depuis la page.** Shotgun ne la publie pas.

Sur 254 événements relevés en août 2026, les 245 lieux publics affichent tous
une adresse complète. Les 9 marqués « Lieu secret » n'en affichent aucune : à
la place, un point générique de la ville, identique d'un événement à l'autre.
Deux soirées berlinoises sans aucun rapport partagent ainsi les mêmes
coordonnées, celles du centre de Berlin.

Ces coordonnées sont donc inutilisables. Y appliquer un géocodage inverse
renverrait une adresse berlinoise crédible et fausse, ce qui reviendrait à
inventer un lieu. L'extension s'en abstient et le signale.

En revanche, l'adresse finit par arriver : l'organisateur l'envoie aux
détenteurs de billets, en général quelques heures avant, par Telegram ou
Instagram. C'est ce canal que l'extension remonte pour t'éviter de relire toute
la description.

## Permissions et vie privée

| Permission | Usage |
|---|---|
| `activeTab` + `scripting` | Lire la page d'événement ouverte, au clic uniquement |
| `storage` | Mémoriser les adresses déjà consultées (30 jours) |
| `https://shotgun.live/*` | Accéder à la page d'événement |
| `https://nominatim.openstreetmap.org/*` | Convertir des coordonnées en adresse |

L'extension ne s'active qu'au clic sur son icône. Aucune donnée ne part
ailleurs que vers OpenStreetMap, et seulement pour les lieux publics. Le cache
reste sur ta machine et ne contient que des couples « coordonnées → adresse ».

## En cas de problème

**« Lecture de la page impossible »** : recharge la page d'événement, puis
clique à nouveau sur l'icône.

**« Service d'adresses momentanément saturé »** : OpenStreetMap limite le
nombre de requêtes. Attends quelques secondes. Les coordonnées et le lien Maps
restent affichés.

## Limites connues

- L'adresse de contrôle OpenStreetMap correspond au **point** indiqué, qui peut
  différer de l'entrée du club quand celle-ci se trouve en retrait de la rue.
- Un changement dans la structure des pages Shotgun peut interrompre la
  lecture des données.
- Mesures d'août 2026. Shotgun peut modifier à tout moment ce qu'il publie.
