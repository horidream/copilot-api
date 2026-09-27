#!/usr/bin/env node

import { defineCommand } from "citty"
import consola from "consola"
import fs from "node:fs/promises"
import os from "node:os"
import { fileURLToPath } from "node:url"

import { isOpencodeOauthApp } from "./lib/api-config"
import { getRawProviderConfig, listEnabledProviders } from "./lib/config"
import { readGitHubToken } from "./lib/credential-store"
import { PATHS } from "./lib/paths"
import { state } from "./lib/state"
import {
  getCopilotToken,
  type GetCopilotTokenResponse,
} from "./services/github/get-copilot-token"

interface DebugInfo {
  providers: {
    codexConfigured: boolean
    enabled: Array<string>
  }
  version: string
  runtime: {
    name: string
    version: string
    platform: string
    arch: string
  }
  paths: {
    APP_DIR: string
    CONFIG_PATH: string
    GITHUB_TOKEN_PATH: string
  }
  tokenExists: boolean
}

interface RunDebugOptions {
  json: boolean
}

async function getPackageVersion(): Promise<string> {
  try {
    const packageJsonPath = fileURLToPath(
      new URL("../package.json", import.meta.url),
    )
    // @ts-expect-error https://github.com/sindresorhus/eslint-plugin-unicorn/blob/v59.0.1/docs/rules/prefer-json-parse-buffer.md
    // JSON.parse() can actually parse buffers
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath)) as {
      version: string
    }
    return packageJson.version
  } catch {
    return "unknown"
  }
}

function getRuntimeInfo() {
  const isBun = typeof Bun !== "undefined"

  return {
    name: isBun ? "bun" : "node",
    version: isBun ? Bun.version : process.version.slice(1),
    platform: os.platform(),
    arch: os.arch(),
  }
}

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath)
    if (!stats.isFile()) return false

    const content = await fs.readFile(filePath, "utf8")
    return content.trim().length > 0
  } catch {
    return false
  }
}

async function getDebugInfo(): Promise<DebugInfo> {
  const [version, tokenExists] = await Promise.all([
    getPackageVersion(),
    checkFileExists(PATHS.GITHUB_TOKEN_PATH),
  ])

  return {
    providers: {
      codexConfigured: getRawProviderConfig("codex") !== null,
      enabled: listEnabledProviders(),
    },
    version,
    runtime: getRuntimeInfo(),
    paths: {
      APP_DIR: PATHS.APP_DIR,
      CONFIG_PATH: PATHS.CONFIG_PATH,
      GITHUB_TOKEN_PATH: PATHS.GITHUB_TOKEN_PATH,
    },
    tokenExists,
  }
}

function printDebugInfoPlain(info: DebugInfo): void {
  consola.info(`copilot-api debug

Version: ${info.version}
Runtime: ${info.runtime.name} ${info.runtime.version} (${info.runtime.platform} ${info.runtime.arch})

Providers:
- enabled: ${info.providers.enabled.join(", ") || "none"}
- codex configured: ${info.providers.codexConfigured ? "Yes" : "No"}

Paths:
- APP_DIR: ${info.paths.APP_DIR}
- CONFIG_PATH: ${info.paths.CONFIG_PATH}
- GITHUB_TOKEN_PATH: ${info.paths.GITHUB_TOKEN_PATH}

GitHub token exists: ${info.tokenExists ? "Yes" : "No"}`)
}

function printDebugInfoJson(info: DebugInfo): void {
  console.log(JSON.stringify(info, null, 2))
}

export async function runDebug(options: RunDebugOptions): Promise<void> {
  const debugInfo = await getDebugInfo()

  if (options.json) {
    printDebugInfoJson(debugInfo)
  } else {
    printDebugInfoPlain(debugInfo)
  }
}

export interface CopilotTokenDebugInfo {
  token: string
  expiresAt: number
  expiresAtIso: string
  refreshIn: number
  apiEndpoint?: string
}

interface RunDebugTokenDependencies {
  getCopilotToken: () => Promise<GetCopilotTokenResponse>
  readGitHubToken: () => Promise<string | null>
}

const defaultDebugTokenDependencies: RunDebugTokenDependencies = {
  getCopilotToken,
  readGitHubToken,
}

export function toCopilotTokenDebugInfo(
  response: GetCopilotTokenResponse,
): CopilotTokenDebugInfo {
  return {
    token: response.token,
    expiresAt: response.expires_at,
    expiresAtIso: new Date(response.expires_at * 1000).toISOString(),
    refreshIn: response.refresh_in,
    apiEndpoint: response.endpoints?.api,
  }
}

// Performs a one-off token exchange with the stored GitHub token. The result is
// not shared with a running server, which keeps its own in-memory token.
export async function runDebugToken(
  options: RunDebugOptions,
  dependencies: RunDebugTokenDependencies = defaultDebugTokenDependencies,
): Promise<CopilotTokenDebugInfo> {
  if (isOpencodeOauthApp()) {
    throw new Error(
      "opencode OAuth uses the GitHub token directly; there is no Copilot token to refresh",
    )
  }

  const githubToken = await dependencies.readGitHubToken()
  if (!githubToken) {
    throw new Error(
      `GitHub token not found at ${PATHS.GITHUB_TOKEN_PATH}. Run \`copilot-api auth login --provider copilot\` first.`,
    )
  }
  state.githubToken = githubToken

  const info = toCopilotTokenDebugInfo(await dependencies.getCopilotToken())

  if (options.json) {
    console.log(JSON.stringify(info, null, 2))
  } else {
    const secondsLeft = info.expiresAt - Math.floor(Date.now() / 1000)
    consola.info(`Copilot token refreshed

Token: ${info.token}
Expires at: ${info.expiresAtIso} (${info.expiresAt}, in ${secondsLeft}s)
Refresh in: ${info.refreshIn}s
API endpoint: ${info.apiEndpoint ?? "n/a"}`)
  }

  return info
}

const jsonArg = {
  json: {
    type: "boolean",
    default: false,
    description: "Output debug information as JSON",
  },
} as const

const debugToken = defineCommand({
  meta: {
    name: "token",
    description:
      "Exchange the stored GitHub token for a fresh Copilot token and print it",
  },
  args: jsonArg,
  async run({ args }) {
    const tlsModule = await import("./lib/tls")
    tlsModule.enableSystemCACompat()
    await runDebugToken({ json: args.json })
  },
})

export const debug = defineCommand({
  meta: {
    name: "debug",
    description: "Print debug information about the application",
  },
  args: jsonArg,
  subCommands: {
    token: debugToken,
  },
  run({ args }) {
    if ((args._[0] ?? "").trim()) {
      return
    }

    return runDebug({
      json: args.json,
    })
  },
})
