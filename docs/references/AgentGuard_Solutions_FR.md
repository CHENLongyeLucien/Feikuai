# AgentGuard — Solution technique (version fusionnée)

*11 octobre 2026*

AgentGuard est un pare-feu de paiement pour agents IA, déployé sur Avalanche. Ce document ne traite qu'une seule question : comment nous résolvons chacun des problèmes posés par le sujet.

---

## 1. Problème et positionnement

**Hypothèse centrale : l'injection réussira forcément.** La sécurité vient d'une structure d'autorisation déterministe, et non du jugement d'un modèle. Même si l'agent de recherche est entièrement manipulé, il ne dispose d'aucun droit on-chain dont on pourrait abuser. Nous n'empêchons pas l'injection : l'injection réussit, mais l'argent ne bouge pas.

### Les cinq problèmes à résoudre

| Problème | Nature | Solution (en une phrase) |
| --- | --- | --- |
| 1. Un agent à faibles privilèges, manipulé par un document piégé, ordonne à l'agent de paiement d'effectuer un virement (OWASP ASI03, ASI07) | Problème structurel de droits, pas de détection | Chaque paiement doit présenter une chaîne d'autorité allant d'un humain jusqu'à l'agent, vérifiée maillon par maillon par un smart contract ; s'il manque un maillon, le paiement est refusé |
| 2. Les faux positifs submergent les équipes fraude et conformité | L'humain ne devrait traiter qu'un petit nombre de décisions à forte valeur | Des règles déterministes acceptent ou refusent automatiquement ; seuls les paiements au-dessus du seuil ou d'origine douteuse sont confiés à un humain, avec une explication |
| 3. DORA impose de détecter, classifier et déclarer rapidement les incidents TIC majeurs ; un incident DeFi se joue en quelques minutes | Surveillance temps réel + chronologie prouvable | Coupe-circuit automatique en cas d'anomalie, classification automatique selon les critères DORA et génération d'un projet de notification initiale |
| 4. Assureurs et auditeurs exigent la preuve que l'IA est maîtrisée | Les preuves doivent pouvoir être vérifiées indépendamment par un tiers | Chaque décision laisse un enregistrement complet dont l'empreinte est inscrite on-chain : tout le monde peut vérifier, personne ne peut modifier après coup |
| 5. Nouvelles attaques liées aux micropaiements à haute fréquence (« salami », faux services payants) | Indétectables par une vérification transaction par transaction | Plafond cumulé par jour et limite de fréquence, au lieu de regarder uniquement le montant unitaire |

### Différences d'ingénierie avec les solutions existantes

- **Garde-fous de paiement pour agents** (AWS AgentCore Payments, Coinbase Spend Permissions) : uniquement un budget et une durée de validité par session ; aucune traçabilité de l'origine de l'autorisation entre plusieurs agents. Un paiement vers un fraudeur passe tant qu'il reste dans le budget.
- **Filtres de prompts** (Lakera, Prompt Security) : ils ne regardent que le texte, leur rappel est intrinsèquement peu fiable, et le jury a explicitement dit ne plus vouloir en voir.
- **Multisig Safe** : gère « combien de personnes sont d'accord », pas « quel agent a le droit de déléguer à quel agent, et pour quel montant ».
- **Contrôles au niveau applicatif** : ils tombent dès que le serveur est compromis ; les règles d'AgentGuard sont appliquées au niveau du règlement (smart contract), comme une MMU matérielle plutôt qu'un simple `if` logiciel.

### Principes de conception

1. **La responsabilité de la sécurité repose sur le contrat, pas sur le LLM.** Le LLM ne fait que rédiger les explications ; hors ligne, il est remplacé par des modèles de texte.
2. **Sécurité sans sacrifier la vitesse.** Un paiement normal est vérifié au sein d'une seule transaction (environ 1 seconde) ; seuls les paiements au-dessus du seuil passent par une file d'attente avec validation humaine.
3. **Fail-safe.** Si un maillon manque, a expiré ou est incertain, le refus est la règle par défaut ; un faux blocage coûte un délai, un paiement non bloqué coûte l'argent.

---

## 2. Problème 1 : un agent manipulé initie un paiement

**Solution : la décision d'accepter un paiement dépend uniquement de l'intégrité de la « chaîne d'autorité », et non de ce que dit l'agent.** Même entièrement manipulé, l'agent de recherche n'a aucun droit de paiement : ses « ordres » ne peuvent pas constituer un maillon valide on-chain.

### Fonctionnement

1. **L'humain définit d'abord les droits** : le propriétaire des fonds signe une autorisation avec son propre wallet, en précisant quel agent peut payer, le plafond journalier, les seuls bénéficiaires autorisés et la date d'expiration. Seul l'agent de paiement reçoit une autorisation ; l'agent de recherche n'en a aucune.
2. **Chaque paiement doit présenter sa chaîne d'autorité** : du propriétaire des fonds jusqu'à l'agent qui initie le paiement ; chaque agent intermédiaire constitue un maillon.
3. **Le smart contract vérifie chaque maillon** : chaque maillon doit être enregistré, non expiré, correctement signé, sous le plafond de ce maillon, avec un bénéficiaire figurant sur la liste blanche de ce maillon. Si une seule condition échoue, la transaction est annulée et l'argent ne bouge pas.
4. **La vérification se fait dans le contrat, pas sur le serveur** : même si nos propres serveurs sont piratés, l'attaquant ne peut pas contourner les règles du contrat.

### Résultat selon les situations

| Situation | Chaîne d'autorité | Résultat |
| --- | --- | --- |
| Paiement normal | Propriétaire → agent de paiement, bénéficiaire sur liste blanche, 1 200 USDC | Exécuté directement en environ 1 seconde |
| Attaque par injection | Propriétaire → agent de recherche → agent de paiement | Le premier maillon n'existe pas : refusé |
| Bénéficiaire remplacé par un fraudeur | Propriétaire → agent de paiement, bénéficiaire inconnu | Hors liste blanche : refusé |
| Montant au-dessus du seuil unitaire | Propriétaire → agent de paiement, 8 000 USDC (seuil 5 000) | Mis en attente de validation humaine |

### Une faille à combler impérativement

Si l'agent de paiement, manipulé par l'agent de recherche, **ne présente que la chaîne valide « propriétaire → agent de paiement »** sans jamais mentionner l'agent de recherche, la vérification de la chaîne passe. Trois niveaux de réponse :

1. **L'origine est renseignée par le programme, pas déclarée par l'IA** : le runtime de l'agent étiquette chaque message selon son origine (humain, autre agent ou document externe). Si le message qui déclenche le paiement provient d'un autre agent, le programme l'inscrit obligatoirement dans la chaîne d'autorité. Le modèle d'IA ne peut que produire du texte ; il n'a pas accès à ces étiquettes.
2. **Tout paiement issu d'un document externe est confié à un humain** : lorsque le contrat voit que l'origine est un document externe, il n'exécute jamais automatiquement.
3. **Liste blanche et plafonds en dernier rempart** : même si l'étiquette d'origine est contournée, la liste blanche des bénéficiaires, le plafond journalier, la limite de fréquence et le seuil unitaire restent en vigueur ; l'argent ne peut pas partir vers une adresse inconnue.

Autrement dit : la chaîne d'autorité répond à « qui a ordonné le paiement », la liste blanche et les plafonds à « à qui et combien », la validation humaine à « en cas de doute, on demande », et le coupe-circuit à « anomalie persistante, on arrête ».

### Si l'agent de paiement lui-même est manipulé ou si sa clé fuit

Il ne peut agir que dans les limites de son plafond et de sa liste blanche ; au-delà du seuil, une signature humaine est requise ; une fréquence anormale déclenche le coupe-circuit. Nous ne prétendons pas bloquer toutes les attaques de ce type, mais la perte reste limitée au plafond fixé à l'avance.

---

## 3. Problème 2 : les faux positifs submergent les analystes

**Solution : la grande majorité des paiements est traitée automatiquement par des règles déterministes ; l'humain ne voit que les rares cas qui demandent vraiment un jugement, chacun accompagné d'une explication compréhensible.**

### Pourquoi les méthodes classiques submergent les équipes

Les moteurs de règles classiques comme la détection par IA « devinent » si une transaction est frauduleuse ; dans le doute, ils alertent. La plupart des alertes sont donc des faux positifs. Avec trop de faux positifs, les équipes finissent par ignorer les alertes.

### Notre approche

1. **On ne devine pas, on vérifie des règles** : chaîne d'autorité complète ou non, bénéficiaire sur liste blanche ou non, plafond dépassé ou non, fréquence anormale ou non. Ce sont des questions fermées, sans zone grise. Les cas clairs sont acceptés ou refusés automatiquement, sans déranger personne.
2. **Seule la zone grise va à l'humain** : montant au-dessus du seuil unitaire, ou instruction de paiement issue d'un document externe. Le paiement entre alors dans la file de validation ; le validateur l'accepte ou le refuse en signant avec son propre wallet. Sans signature dans le délai, il expire automatiquement.
3. **Le score de risque sert uniquement à prioriser** : nouveau bénéficiaire, montant inhabituel, rafale de micropaiements, origine « document externe »… Ces signaux donnent un score de 0 à 1 qui détermine l'ordre dans la file. Le score ne décide jamais de l'acceptation.
4. **L'IA explique, elle ne décide pas** : elle traduit le motif de refus en une phrase lisible, par exemple « l'agent de recherche ne fait pas partie de la chaîne d'autorité ; le bénéficiaire n'est pas sur la liste blanche ». Si l'IA est indisponible, un modèle de texte fixe la remplace, sans impact sur la sécurité.

### Niveaux de risque et réponses

| Niveau | Déclencheur | Action automatique | Personne notifiée |
| --- | --- | --- | --- |
| Normal | Chaîne complète, liste blanche, sous plafond | Exécution immédiate | Aucune, simple enregistrement |
| À valider | Au-dessus du seuil unitaire, ou origine document externe | Suspension, entrée en file de validation | Validateur |
| Refus | Chaîne rompue, hors liste blanche, plafond journalier dépassé | Transaction annulée | Enregistré et compté pour le coupe-circuit |
| Coupe-circuit | Plusieurs refus en peu de temps ou autre anomalie | Suspension de tous les paiements d'agents, projet DORA généré | Responsable sécurité + responsable conformité |

### Comment prouver qu'il y a peu de faux positifs

À partir de données synthétiques (500 paiements normaux et 50 variantes d'attaque), on compare avec l'approche actuelle « budget uniquement » sur trois indicateurs : part des attaques bloquées (taux de détection), part des paiements normaux bloqués à tort (taux de faux blocage), part nécessitant une intervention humaine (taille de la file de validation).

---

## 4. Problème 3 : déclaration DORA rapide et incidents à l'échelle de la minute

**Solution : dès qu'une anomalie apparaît, le coupe-circuit s'enclenche automatiquement ; en parallèle, le système détermine selon les critères DORA s'il s'agit d'un incident majeur et génère un projet de notification initiale. La chronologie est tirée directement des enregistrements on-chain et peut être vérifiée indépendamment.**

### Coupe-circuit en temps réel

Le service de surveillance suit chaque décision on-chain et agit selon les règles suivantes (seuils configurables) :

| Règle | Seuil par défaut | Action |
| --- | --- | --- |
| Même agent refusé plusieurs fois en peu de temps | ≥ 3 fois en 10 minutes | Suspension du contrat + projet DORA |
| Bénéficiaire vu pour la première fois | 1 fois | Alerte sur le tableau de validation |
| Cumul journalier proche du plafond | Au-delà de 80 % | Alerte |
| Tentative de dépassement du plafond journalier | 1 fois | Suspension du contrat |

Une fois le contrat suspendu, tous les paiements d'agents sont refusés jusqu'à ce que le propriétaire des fonds lève lui-même la suspension. Le service de surveillance ne dispose que du droit de « suspendre » : même si sa clé fuit, un attaquant peut au pire arrêter le système, sans pouvoir déplacer de fonds ni lever la suspension. Sur Avalanche, il s'écoule environ 1 seconde entre la détection et l'effet de la suspension.

### Comment qualifier un incident majeur DORA

DORA regarde l'ampleur de l'impact, pas la possibilité de récupérer les fonds. Un seul paiement frauduleux n'est généralement pas un incident majeur ; il peut le devenir si la même faille est exploitée à grande échelle. Règle de classification (Règlement délégué (UE) 2024/1772) :

- **Condition nécessaire** : un service critique est touché (par exemple les paiements).
- **Plus l'une des conditions suivantes** : un accès malveillant non autorisé ayant entraîné une perte de données ; ou au moins deux critères du tableau ci-dessous au-delà de leur seuil.

| Critère | Seuil (indicatif) |
| --- | --- |
| Clients / transactions touchés | Plus de 10 % des clients, ou plus de 100 000 clients, ou plus de 10 % des transactions |
| Durée / indisponibilité | Plus de 24 heures, ou indisponibilité d'un service critique de plus de 2 heures |
| Étendue géographique | Au moins 2 États membres de l'UE |
| Impact économique | Plus de 100 000 € |
| Perte de données | Atteinte à la disponibilité, l'intégrité, l'authenticité ou la confidentialité |
| Impact réputationnel | Couverture médiatique, plaintes nombreuses, attention du régulateur |

### Projet de notification initiale généré automatiquement

Lors d'un coupe-circuit ou d'un refus grave, le système remplit automatiquement : la chronologie de l'incident (horodatages issus des enregistrements on-chain), les critères atteints, les agents et transactions concernés, les mesures déjà prises, et les échéances de déclaration. L'empreinte du projet est elle aussi inscrite on-chain, ce qui prouve quand il a été généré et qu'il n'a pas été modifié depuis.

**Délais de déclaration DORA** : notification initiale dans les 4 heures suivant la qualification d'incident majeur, et au plus tard 24 heures après sa détection ; rapport intermédiaire sous 72 heures ; rapport final sous 1 mois. Nous ne revendiquons qu'un « projet de notification initiale », que le responsable conformité valide avant envoi ; les seuils seront vérifiés par rapport au texte du règlement lors de l'implémentation.

---

## 5. Problème 4 : auditeurs et assureurs exigent la preuve que l'IA est maîtrisée

**Solution : chaque décision laisse un enregistrement complet, dont l'empreinte est inscrite on-chain. Auditeurs et assureurs peuvent vérifier par eux-mêmes, sans avoir à nous faire confiance ; et nous-mêmes ne pouvons rien modifier après coup.**

### Ce que contient chaque enregistrement de décision

- Quel agent, à quel moment, vers quel bénéficiaire, pour quel montant
- La chaîne d'autorité complète : à partir de quel humain, en passant par quels agents
- L'origine de l'instruction de paiement : humain, autre agent ou document externe
- Le résultat : exécuté, en attente, validé par un humain, refusé, expiré
- La règle déclenchée, le score de risque et les signaux détectés
- La version des règles et la version du modèle d'IA utilisées à ce moment-là
- En cas de validation humaine, l'identité du validateur
- Une explication lisible par un humain

Ces champs répondent précisément aux questions de l'auditeur : « qui a autorisé, sur la base de quelle règle, qui a tranché ».

### Comment rendre les enregistrements infalsifiables

- **Décisions prises dans le contrat** (exécution, mise en attente, validation humaine) : ce sont déjà des événements on-chain, publics et consultables.
- **Paiements refusés** : une transaction annulée ne laisse aucune trace on-chain ; nous conservons donc l'enregistrement off-chain et, toutes les quelques minutes, nous regroupons un lot d'enregistrements en une empreinte globale inscrite on-chain. Chaque enregistrement peut prouver qu'il appartient à un lot donné.
- **Rapports DORA** : l'empreinte du fichier du rapport est également inscrite on-chain.

### Comment l'auditeur vérifie de manière indépendante

1. Il récupère un enregistrement de décision.
2. Il recalcule lui-même son empreinte.
3. Il retrouve, sur l'explorateur de blocs d'Avalanche (Snowtrace), l'empreinte on-chain correspondant à cette date.
4. Si les deux concordent, l'enregistrement existait bien à ce moment-là et n'a pas été modifié depuis.

### Ce qui va on-chain, et ce qui reste off-chain

On-chain : uniquement l'application obligatoire des règles et les empreintes des enregistrements. Le texte des enregistrements, l'analyse de risque et les documents d'origine restent off-chain. Deux raisons : le coût, et le RGPD. Les données on-chain sont publiques et ineffaçables ; **aucune donnée personnelle n'est donc inscrite on-chain**, seulement des adresses et des empreintes.

### « Si le modèle se trompe, qui est responsable ? »

Dans ce système, le modèle d'IA ne prend aucune décision d'acceptation ; il ne rédige que des explications. L'acceptation repose sur l'autorisation signée par un humain et sur des règles déterministes ; les paiements qui nécessitent un jugement sont signés par un validateur nommément désigné. La responsabilité incombe à la personne qui a signé l'autorisation et au validateur, et chaque étape laisse une trace infalsifiable. Ces enregistrements peuvent aussi être fournis aux assureurs comme preuve que « l'IA est maîtrisée ».

---

## 6. Problème 5 : nouvelles attaques liées aux micropaiements à haute fréquence

**Solution : ne pas regarder seulement le montant unitaire, mais appliquer un plafond cumulé par jour, limiter la fréquence et surveiller les changements de bénéficiaires.**

Beaucoup de paiements d'agents IA se comptent en centimes, par milliers ou dizaines de milliers par jour (par exemple le paiement à l'appel d'une API). Cela ouvre deux types d'attaques invisibles si l'on ne regarde que le montant unitaire :

| Attaque | Déroulement | Notre parade |
| --- | --- | --- |
| Attaque « salami » | Dix mille paiements de 0,009 $, chacun sous le seuil d'alerte | Le contrat cumule par jour les dépenses de chaque agent et refuse au-delà du plafond journalier ; il limite aussi le nombre de paiements par unité de temps |
| Faux service payant | Une API malveillante se fait passer pour un service légitime, ou augmente discrètement son prix ; l'agent paie sans broncher | Le bénéficiaire doit figurer sur la liste blanche ; le score de risque surveille les « hausses de prix soudaines d'un même service » et les « nouveaux bénéficiaires » |

Ces vérifications s'effectuent dans la même transaction que le contrôle de la chaîne d'autorité : un micropaiement normal arrive toujours en environ 1 seconde. Si chaque paiement de quelques centimes devait attendre une validation humaine, le micropaiement à haute fréquence n'aurait plus de sens : sécurité, sans sacrifier la vitesse.

---

## 7. Le rôle d'Avalanche dans la solution

Avalanche n'est pas ajouté pour cocher une case : chacune des solutions ci-dessus repose sur l'une de ses caractéristiques.

| Solution | Caractéristique d'Avalanche | Pourquoi |
| --- | --- | --- |
| Vérification de la chaîne d'autorité dans le contrat (problème 1) | Smart contracts appliqués par l'ensemble du réseau, compatibles avec l'outillage Ethereum | Même un serveur compromis ne peut pas contourner les règles |
| Coupe-circuit en temps réel (problème 3) | Finalité déterministe en environ 1 seconde | La suspension prend effet en moins d'un bloc, au rythme des incidents DeFi |
| Traçabilité de chaque décision (problème 4) | Frais très faibles | Inscrire chaque décision on-chain est économiquement viable |
| Micropaiements non ralentis (problème 5) | Confirmation rapide + USDC natif + écosystème x402 | Vérification et paiement se font dans la même transaction, en environ 1 seconde |
| Utilisable par des institutions régulées | L1 Avalanche permissionnée (seules les adresses autorisées peuvent transagir) | Banques et prestataires agréés MiCA peuvent déployer les mêmes règles sur leur propre chaîne conforme |
| Confidentialité des montants + visibilité régulateur (optionnel) | Jetons chiffrés eERC | Montants chiffrés pour le public, transparents pour le régulateur |
| Autorisation inter-institutions (optionnel) | Messagerie inter-chaînes ICM | La chaîne d'autorité peut être vérifiée entre agents situés sur des chaînes différentes |

Le MVP tourne sur Fuji, le réseau de test d'Avalanche ; la L1 permissionnée, eERC et ICM sont des pistes d'évolution.
