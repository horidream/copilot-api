import { afterEach, beforeEach, expect, mock, test } from "bun:test"

import {
  COPILOT_TOKEN_ENV,
  readCopilotTokenFromEnv,
} from "~/lib/credential-store"
import { state } from "~/lib/state"
import {
  type CopilotTokenDependencies,
  parseCopilotTokenExpiry,
  setupCopilotToken,
  stopCopilotRefreshLoop,
  toPrefilledCopilotTokenResponse,
} from "~/lib/token"

const nowSeconds = () => Math.floor(Date.now() / 1000)

const getCopilotTokenMock = mock(() =>
  Promise.resolve({
    token: "exchanged-token",
    refresh_in: 1_500,
    expires_at: nowSeconds() + 1_800,
  }),
)

const dependencies: CopilotTokenDependencies = {
  getCopilotToken: getCopilotTokenMock,
  getCopilotUsage: () => Promise.resolve(null),
}

beforeEach(() => {
  state.githubToken = "github-token"
  state.copilotToken = undefined
  state.copilotApiUrl = undefined
  getCopilotTokenMock.mockClear()
})

afterEach(() => {
  stopCopilotRefreshLoop()
  delete process.env.COPILOT_API_OAUTH_APP
  delete process.env[COPILOT_TOKEN_ENV]
})

test("parses exp from a Copilot token", () => {
  expect(parseCopilotTokenExpiry("tid=abc;exp=1700000000;sku=x:sig")).toBe(
    1_700_000_000,
  )
  expect(parseCopilotTokenExpiry("exp=42")).toBe(42)
})

test("returns undefined when a Copilot token has no exp field", () => {
  expect(parseCopilotTokenExpiry("tid=abc;sku=x")).toBeUndefined()
  expect(parseCopilotTokenExpiry("tid=abc;rexp=1700000000")).toBeUndefined()
})

test("builds a token response with refresh_in from the remaining lifetime", () => {
  const nowMs = 1_700_000_000_000
  const response = toPrefilledCopilotTokenResponse(
    "tid=abc;exp=1700001800;sku=x",
    nowMs,
  )

  expect(response).toEqual({
    token: "tid=abc;exp=1700001800;sku=x",
    expires_at: 1_700_001_800,
    refresh_in: 1_800,
  })
})

test("rejects a prefilled token without exp", () => {
  expect(() => toPrefilledCopilotTokenResponse("tid=abc")).toThrow(
    "no exp field",
  )
})

test("rejects an expired prefilled token", () => {
  expect(() =>
    toPrefilledCopilotTokenResponse("exp=1700000000", 1_700_000_000_000),
  ).toThrow("expired at 2023-11-14T22:13:20.000Z")
})

test("uses the prefilled token without exchanging the GitHub token", async () => {
  const token = `tid=abc;exp=${nowSeconds() + 1_800}`

  await setupCopilotToken(dependencies, { prefilledToken: token })

  expect(state.copilotToken).toBe(token)
  expect(getCopilotTokenMock).not.toHaveBeenCalled()
})

test("exchanges the GitHub token when no token is prefilled", async () => {
  await setupCopilotToken(dependencies)

  expect(state.copilotToken).toBe("exchanged-token")
  expect(getCopilotTokenMock).toHaveBeenCalledTimes(1)
})

test("ignores a prefilled token for opencode OAuth", async () => {
  process.env.COPILOT_API_OAUTH_APP = "opencode"

  await setupCopilotToken(dependencies, { prefilledToken: "exp=1" })

  expect(state.copilotToken).toBe("github-token")
  expect(getCopilotTokenMock).not.toHaveBeenCalled()
})

test("reads a trimmed Copilot token from the environment", () => {
  expect(readCopilotTokenFromEnv()).toBeUndefined()

  process.env[COPILOT_TOKEN_ENV] = "  exp=123  "
  expect(readCopilotTokenFromEnv()).toBe("exp=123")

  process.env[COPILOT_TOKEN_ENV] = "   "
  expect(readCopilotTokenFromEnv()).toBeUndefined()
})
