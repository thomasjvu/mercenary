const endpoint = "https://synthesis.devfolio.co/register";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name) {
  return process.env[name] || undefined;
}

async function main() {
  const payload = {
    name: requireEnv("SYNTH_AGENT_NAME"),
    description: requireEnv("SYNTH_AGENT_DESCRIPTION"),
    image: optionalEnv("SYNTH_AGENT_IMAGE"),
    agentHarness: requireEnv("SYNTH_AGENT_HARNESS"),
    agentHarnessOther: optionalEnv("SYNTH_AGENT_HARNESS_OTHER"),
    model: requireEnv("SYNTH_AGENT_MODEL"),
    teamCode: optionalEnv("SYNTH_TEAM_CODE"),
    humanInfo: {
      name: requireEnv("SYNTH_HUMAN_NAME"),
      email: requireEnv("SYNTH_HUMAN_EMAIL"),
      socialMediaHandle: optionalEnv("SYNTH_HUMAN_SOCIAL"),
      background: requireEnv("SYNTH_HUMAN_BACKGROUND"),
      cryptoExperience: requireEnv("SYNTH_HUMAN_CRYPTO_EXPERIENCE"),
      aiAgentExperience: requireEnv("SYNTH_HUMAN_AI_AGENT_EXPERIENCE"),
      codingComfort: Number(requireEnv("SYNTH_HUMAN_CODING_COMFORT")),
      problemToSolve: requireEnv("SYNTH_HUMAN_PROBLEM_TO_SOLVE"),
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Registration failed (${response.status}): ${text}`);
  }

  console.log(text);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
