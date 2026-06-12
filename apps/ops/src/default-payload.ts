export const DEFAULT_SPAWN_PAYLOAD = `{
  "agent": "mercenary-v1",
  "taskType": "code_debugging",
  "task": {
    "title": "Fix Unity 4D movement bug",
    "description": "Player teleports when crossing a rotated hypersurface boundary.",
    "language": "csharp",
    "framework": "unity",
    "files": [
      {
        "path": "Assets/Scripts/Player/FourDMovement.cs",
        "content": "public class FourDMovement {\\n  void Move() {\\n    return;\\n  }\\n}\\n",
        "sha256": "replace_me"
      }
    ],
    "failingSignals": {
      "errors": ["NullReferenceException at line 184"],
      "reproSteps": ["Start level 2", "Rotate on W axis", "Cross boundary"]
    }
  },
  "output": {
    "primaryType": "patch",
    "artifactTypes": ["patch", "text"]
  },
  "raidPolicy": {
    "maxAgents": 3,
    "requiredCapabilities": ["unity", "debugging", "physics"],
    "allowedModelFamilies": ["openai", "venice"],
    "minReputationScore": 70,
    "privacyMode": "prefer",
    "requirePrivacyFeatures": ["signed_outputs"],
    "allowedOutputTypes": ["patch", "text"],
    "maxTotalCost": 20,
    "selectionMode": "privacy_first"
  },
  "hostContext": {
    "host": "codex"
  }
}`;

export const STRICT_PRIVATE_SPAWN_PAYLOAD = `{
  "agent": "mercenary-v1",
  "taskType": "analysis",
  "task": {
    "title": "Review a sensitive incident and return one verified summary",
    "description": "Route this through the strict-private lane. Keep sensitive context inside Venice-backed providers, verify the outputs, and return one canonical response plus receipt proof.",
    "language": "text",
    "files": [
      {
        "path": "incident.txt",
        "content": "Customer identifiers, internal timeline details, and remediation notes are included here for private review.",
        "sha256": "demo-private-incident"
      }
    ],
    "failingSignals": {
      "errors": [],
      "reproSteps": [
        "Read the incident summary",
        "Identify the root cause",
        "Return the final summary without exposing sensitive raw context"
      ],
      "expectedBehavior": "Return one verified summary and keep the raw incident details inside the strict-private Venice lane."
    }
  },
  "output": {
    "primaryType": "text",
    "artifactTypes": ["text"]
  },
  "raidPolicy": {
    "maxAgents": 2,
    "requiredCapabilities": ["analysis", "safety"],
    "allowedModelFamilies": ["venice"],
    "minReputationScore": 0,
    "requireErc8004": true,
    "minTrustScore": 80,
    "privacyMode": "strict",
    "requirePrivacyFeatures": ["tee_attested", "e2ee", "no_data_retention", "signed_outputs"],
    "allowedOutputTypes": ["text"],
    "maxTotalCost": 12,
    "selectionMode": "privacy_first"
  },
  "hostContext": {
    "host": "codex"
  }
}`;

export const SPAWN_PAYLOAD_PRESETS = [
  {
    id: 'default',
    label: 'Code debugging',
    payload: DEFAULT_SPAWN_PAYLOAD,
  },
  {
    id: 'strict-private',
    label: 'Strict-private analysis',
    payload: STRICT_PRIVATE_SPAWN_PAYLOAD,
  },
] as const;
