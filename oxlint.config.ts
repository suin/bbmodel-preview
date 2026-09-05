import config from "@suin/oxlint/lint/bun";
import { type OxlintConfig, defineConfig } from "oxlint";

const unsupportedRuleNames = new Set([
  "sonarjs/aws-s3-bucket-server-encryption",
  "sonarjs/certificate-transparency",
  "sonarjs/cookies",
  "sonarjs/dns-prefetching",
  "sonarjs/encryption",
  "sonarjs/no-vue-bypass-sanitization",
  "sonarjs/process-argv",
  "sonarjs/regular-expr",
  "sonarjs/sockets",
  "sonarjs/standard-input",
  "sonarjs/xpath",
]);

function omitUnsupportedRules(source: OxlintConfig): OxlintConfig {
  return {
    ...source,
    extends: source.extends?.map(omitUnsupportedRules),
    rules: Object.fromEntries(
      Object.entries(source.rules ?? {}).filter(
        ([ruleName]) => !unsupportedRuleNames.has(ruleName),
      ),
    ),
  };
}

export default defineConfig(omitUnsupportedRules(config));
