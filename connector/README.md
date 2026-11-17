# Connecteur clients Sage 50

Ce connecteur Windows lit les fiches clients de Sage 50 via l'interface COM installée avec
Gestion Commerciale. Il ne modifie aucune donnée Sage. Toutes les cinq minutes, il récupère dans
YetiQuote la liste des codes clients utiles, lit uniquement ces fiches et envoie un instantané à
YetiQuote par HTTPS.

Les informations synchronisées sont les adresses de facturation et de livraison, les coordonnées,
le SIRET, le numéro de TVA, le mode et le délai de règlement, le contact et le représentant.

## Installation

1. Déployer YetiQuote avec une variable serveur `SAGE_CONNECTOR_TOKEN` longue et aléatoire.
2. Ouvrir PowerShell avec le compte Windows qui utilisera le connecteur.
3. Exécuter `Install-YetiQuoteSageConnector.ps1` et saisir le même jeton lorsqu'il est demandé.

Le jeton est chiffré avec la protection Windows du compte courant. Le planificateur lance la version
32 bits de Windows PowerShell, nécessaire pour l'interface COM de Sage 50.
