
# Yeti Lab / Yeti Factory — App de calcul de prix

## Objectif
Remplacer les 4 fichiers Excel (TdP, CONTRA, Kits, STANDS) par une app web interne. Pas de génération de devis IA, pas d'export Sage CIEL (Sage reste l'outil officiel de devis).

## Stack
- TanStack Start + React + Tailwind (déjà en place)
- Lovable Cloud (Postgres + Auth email/mot de passe)
- Rôles `admin` et `user` (table `user_roles` séparée, sécurisée)

## Pages
1. **Connexion** — email + mot de passe
2. **Tableau de bord** — KPI (nb dossiers récents, nb clients, nb dossiers validés) + 5 derniers dossiers + bouton « Nouveau dossier »
3. **Clients** — liste, recherche, création/édition (entreprise, contact, email, téléphone, adresse, nb dossiers, dernière MAJ)
4. **Liste des dossiers** — filtres par client / type / statut, tri par date
5. **Nouveau dossier** — choix client + type (Standard / Contra / Kits / Stands) → ouvre le bon calculateur
6. **Détail dossier** — formulaire de calcul + résultats live + sauvegarde + statut + note OneDrive
7. **Admin** (rôle admin uniquement) — gestion utilisateurs + valeurs par défaut des coefficients

## Modèle de données (Lovable Cloud)
- `profiles` (id, full_name, email)
- `user_roles` (user_id, role) — pattern sécurisé `has_role()`
- `clients` (id, entreprise, contact, email, telephone, adresse, created_by, timestamps)
- `dossiers` (id, reference, objet, client_id, contact, email, type, statut, onedrive_note, created_by, created_at, updated_at)
- `dossier_calculs` (dossier_id, payload JSON des entrées, results JSON des résultats calculés, params JSON des coefficients utilisés)
- `app_defaults` (clé / valeur — coefficients par défaut éditables par admin)

Statuts : `brouillon`, `valide`, `archive`. Référence auto `YETI-AAAA-NNNN` (modifiable).

## Logique de calcul (fidèle aux Excel, multi-quantités jusqu'à 5)

Chaque calculateur accepte un tableau de 1 à 5 scénarios de quantité et affiche un tableau comparatif (colonnes Qté1…Qté5). Tous les coefficients sont pré-remplis avec les valeurs des fichiers Excel et modifiables dans le formulaire.

### Standard (TdP.xlsx)
- Achats principaux (lignes libres, prix unitaire HT)
- Achats annexes (forfait global divisé par la quantité)
- **Commission sourcing** activable (O/N, défaut O) : 5 % du sous-total achats, mini 200 € par dossier
- **Coefficient de marge** par défaut **33,33 %** (appliqué pour passer de l'achat au prix de vente net)
- **Frais fixes** (créa + transport interne) : défaut **4 %** des achats totaux
- **Commission rapporteur** unitaire (% du PV) — optionnelle
- Sorties : Prix unitaire achat, Prix vente net unitaire, Budget net, Total dépenses, Marge nette résiduelle Yeti, % marge, Total CA, alerte « marge insuffisante » si < 20 %

### Contra (TdP_CONTRA.xlsx)
- Section **Achats chez Contra** avec coef Contra par défaut **25 %**
- Section **Achats annexes / autres** avec coef par défaut **33,33 %**
- Commission sourcing identique (5 %, mini 200 €), défaut N
- Frais fixes 4 %
- Commission rapporteur unitaire
- Sorties : PV partie Contra, Total achats Contra, Marge résiduelle Contra, Marge résiduelle achats extérieurs, Marge globale, % marge par segment, Total CA

### Kits (TdP_Kits.xlsx)
- Logique « kit » : éléments composés (carte, présentoir, accessoires…) avec quantités par variante
- **Marge résiduelle cible** par défaut **35 %** → PV unitaire = achat / (1 − marge)
- Matrice quantité par variante (jusqu'à 10 colonnes de variantes possibles dans Excel — j'expose 5 par défaut, configurable)
- Sorties : prix de vente unitaire par élément, montant total par élément, total kit

### Stands (TdP_STANDS.xlsx)
- Même squelette que Standard, adapté à la nomenclature stand (structure, impression, montage, transport, main d'œuvre)
- Coefficients spécifiques détectés dans le fichier exposés et modifiables
- Sorties identiques (achats, frais, PV, marge, CA)

> Les valeurs par défaut exactes (coefs, %) sont lues une fois depuis les fichiers et stockées dans `app_defaults`, modifiables par l'admin.

## UX
- Formulaire **gauche** (saisie : quantités, lignes d'achats, coefficients, options), **résultats à droite** mis à jour en temps réel
- Bouton **Sauvegarder brouillon** / **Valider** / **Archiver**
- **Dupliquer un dossier** pour itérer rapidement
- Tableaux de résultats imprimables (PDF simple via impression navigateur)

## Sécurité
- RLS sur toutes les tables ; utilisateurs voient tous les clients/dossiers (usage interne) mais seul l'admin peut supprimer / modifier les coefficients par défaut / gérer les utilisateurs
- Validation Zod côté formulaire

## Hors périmètre v1
- Décompte réel (onglet « DECOMPTE REEL ») → v2
- Export Sage CIEL → v2
- Génération de devis client / PDF stylisé

## Découpage de livraison
1. Cloud + auth + rôles + tableau de bord vide
2. CRUD clients
3. Calculateur **Standard** complet + sauvegarde dossier
4. Calculateurs **Contra**, **Kits**, **Stands**
5. Liste dossiers + filtres + détail/duplication
6. Page Admin (coefficients par défaut + gestion utilisateurs)

## Détails techniques (pour info)
- Calculs faits **côté client** en TypeScript pur (fonctions par type) pour feedback temps réel ; recalculés côté serveur (server function) à la sauvegarde pour cohérence
- `dossier_calculs.payload` et `.results` en JSONB → schéma flexible si les formules évoluent
- Référence dossier générée par séquence Postgres + format `YETI-${année}-${n:04}`
