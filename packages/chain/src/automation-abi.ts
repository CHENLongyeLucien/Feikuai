// Generated from contracts/out/AutomationGuard.sol/AutomationGuard.json; do not hand-edit.
export const automationGuardAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "token_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "policyOwner_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "executor_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "maxPerPaymentAtomic_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "totalBudgetAtomic_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "supplierKeys_",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      },
      {
        "name": "recipients_",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "OBLIGATION_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeRegistered",
    "inputs": [
      {
        "name": "invoiceKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "evidenceCommitment",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "termsHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executor",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hashObligation",
    "inputs": [
      {
        "name": "obligation",
        "type": "tuple",
        "internalType": "struct AutomationGuard.Obligation",
        "components": [
          {
            "name": "invoiceKey",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "supplierKey",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amountAtomic",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "invoiceSettlementCommitment",
    "inputs": [
      {
        "name": "invoiceKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "evidenceCommitment",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxPerPaymentAtomic",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "obligations",
    "inputs": [
      {
        "name": "invoiceKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "supplierKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amountAtomic",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "termsHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "policyOwner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerObligations",
    "inputs": [
      {
        "name": "batch",
        "type": "tuple[]",
        "internalType": "struct AutomationGuard.Obligation[]",
        "components": [
          {
            "name": "invoiceKey",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "supplierKey",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amountAtomic",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registryHash",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "supplierRecipient",
    "inputs": [
      {
        "name": "supplierKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "token",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalBudgetAtomic",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalExecutedAtomic",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalRegisteredAtomic",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "AutomationPaymentExecuted",
    "inputs": [
      {
        "name": "invoiceKey",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "termsHash",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "supplierKey",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amountAtomic",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "evidenceCommitment",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AutomationPolicyInitialized",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "policyOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "executor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "maxPerPaymentAtomic",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalBudgetAtomic",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "registryHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ObligationRegistered",
    "inputs": [
      {
        "name": "invoiceKey",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "termsHash",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "supplierKey",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amountAtomic",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BudgetExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EmptyEvidenceCommitment",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InexactTokenTransfer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidConfiguration",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidObligation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidRegistry",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvoiceAlreadySettled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ObligationAlreadyRegistered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnauthorizedExecution",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnauthorizedRegistration",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownObligation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownSupplier",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WrongRecipient",
    "inputs": []
  }
] as const;
