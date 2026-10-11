# Secure Finance : deux façons de l'utiliser

## En résumé

Secure Finance propose **un seul moteur** (contrôles, autorisation humaine, paiement, preuves) accessible de **deux façons**, selon la taille et l'équipement de l'entreprise.

| | **Interface (Workspace)** | **API d'intégration** |
|---|---|---|
| **Pour qui** | Petites entreprises sans logiciel de comptes fournisseurs | Grandes entreprises avec un ERP ou un logiciel comptable |
| **Principe** | Elles utilisent directement notre interface web | Elles gardent leur interface et nous appellent en arrière-plan |
| **Qui saisit les données** | L'utilisateur, à la main (import, upload de facture) | Le système du client, automatiquement |
| **Qui suit les statuts** | L'utilisateur, dans l'interface | Le système du client, en interrogeant l'API |
| **Mise en place** | Aucune : on se connecte et on utilise | Un développeur du client branche l'API |
| **Source de vérité comptable** | Secure Finance | L'ERP du client |

Le moteur est le même dans les deux cas : mêmes contrôles, mêmes règles, même autorisation humaine.

## Mode 1 : l'interface, pour les petites entreprises

1. L'utilisateur ouvre le Workspace et se connecte.
2. Il ajoute une facture (PDF, e-mail, texte ou transcription vocale).
3. Le système lit la facture et lance les contrôles (sécurité, puis finances contre les registres de confiance).
4. En cas d'anomalie, le dossier est mis en attente avec une explication.
5. Sinon, il clique sur **Approve & pay** : la proposition de paiement est figée (montant, destinataire, etc.).
6. Un humain vérifie et signe avec son portefeuille dans l'application d'approbation.
7. Le paiement est exécuté une seule fois et suivi.
8. Il n'est affiché « Payé » qu'après vérification du reçu blockchain ; l'utilisateur télécharge le rapport.

## Mode 2 : l'API, pour les grandes entreprises

```text
ERP du client  ──(appels API)──>  Secure Finance
     ^                                  |
     └────────(statuts, résultats)──────┘
```

Leurs employés continuent de travailler dans leur ERP. Secure Finance agit en coulisses.

### Authentification

- Chaque client reçoit un **token secret**, envoyé dans chaque requête : `Authorization: Bearer <token>`.
- Le token est lié à **un seul client** (tenant). Il ne peut jamais lire les données d'un autre.
- Le client ne dit jamais « je suis tel tenant » dans sa requête : c'est le token qui le détermine.

### Les étapes d'un paiement via l'API

Base URL : `/api/v1/integrations`

| Étape | Appel | Ce qui se passe |
|---|---|---|
| 1 | `POST /payables` | L'ERP envoie le payable (fournisseur, montant, référence) |
| 2 | `POST /cases` | L'ERP envoie la facture (fichier PDF) |
| 3 | `POST /cases/{id}/analysis` | Relance de l'analyse (réponse immédiate « acceptée », travail en arrière-plan) |
| 4 | `GET /cases/{id}` | L'ERP lit le statut, les contrôles, la proposition et le lien d'approbation |
| 5 | (signature) | Un humain du client vérifie et signe dans l'application d'approbation |
| 6 | `GET /executions/{id}` | L'ERP suit l'exécution jusqu'à `CONFIRMED` |

L'étape 5 reste **toujours humaine**. L'API ne peut jamais autoriser un paiement à elle seule.

### Idempotence, identifiants, erreurs

- Chaque création envoie un header `Idempotency-Key`. Même clé et même contenu : on renvoie la réponse précédente. Même clé et contenu différent : `409 IDEMPOTENCY_CONFLICT`.
- L'ERP identifie ses payables avec **son propre identifiant** (`sourceSystem` + `externalId`).
- Toutes les erreurs ont le format `{ "error": { "code": "...", "message": "..." } }`.

## Garanties communes aux deux modes

- Une facture ne peut jamais créer une autorisation de paiement.
- Une signature humaine est toujours requise.
- Le serveur ne reçoit jamais la clé privée de l'approbateur.
- Un paiement n'est `CONFIRMED` qu'après vérification du reçu blockchain.
- Une proposition figée ne peut plus être modifiée.

## Ce qui est implémenté (11 octobre 2026)

- Code : `apps/api/src/integrations/api.ts`. Contrat : [integration/openapi.yaml](integration/openapi.yaml). Guide détaillé (anglais) : [INTEGRATION_API.md](INTEGRATION_API.md).
- Création d'un token : `pnpm integration:token issue --tenant <tenant> --name <nom>`. Le secret est affiché une seule fois et seule son empreinte SHA-256 est stockée. Révocation : `pnpm integration:token revoke --id <id>`.
- Démonstration « ERP » : `FEIKUAI_TOKEN=sfk_... pnpm integration:demo` (facture conforme), puis `-- --attack` (portefeuille de paiement modifié). Résultats mesurés :
  - facture conforme : `READY_FOR_APPROVAL` ;
  - portefeuille modifié : `NEEDS_REVIEW` avec la raison en clair ;
  - dans les deux cas, en 1,5 s.
- Appel supplémentaire : `GET /payables/{sourceSystem}/{externalId}`.
- Codes supplémentaires :
  - `PAYABLE_EXISTS` : un payable importé ne peut plus être modifié ;
  - `INVOICE_REFERENCE_EXISTS` ;
  - `SUPPLIER_VERSION_CONFLICT` : changer de portefeuille exige une nouvelle version du fournisseur.
- Statuts d'un dossier : `PROCESSING`, `NEEDS_INFORMATION`, `NEEDS_REVIEW`, `READY_FOR_APPROVAL`, `AUTHORIZED`, `PAYMENT_PENDING`, `PAID`, `OUTCOME_UNKNOWN`, chacun avec une phrase `nextAction`.
- Le contrat a le dernier mot : un paiement ne s'exécute que vers un fournisseur enregistré dans le PaymentGuard déployé. Sinon, le dossier est retenu (`VAULT_MAPPING`).
- Pas encore inclus :
  - les webhooks sortants vers l'ERP (l'ERP interroge l'API) ;
  - la gestion des tokens dans l'interface ;
  - d'autres actifs que DEMO.
