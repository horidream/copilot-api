import { afterEach, expect, mock, spyOn, test } from "bun:test"

import { runDebugToken, toCopilotTokenDebugInfo } from "~/debug"
import { state } from "~/lib/state"

const tokenResponse = {
  token: "copilot-token",
  expires_at: 1_800_000_000,
  refresh_in: 1_500,
  endpoints: { api: "https://api.individual.githubcopilot.com" },
}

const originalOauthApp = process.env.COPILOT_API_OAUTH_APP

afterEach(() => {
  if (originalOauthApp === undefined) {
    delete process.env.COPILOT_API_OAUTH_APP
  } else {
    process.env.COPILOT_API_OAUTH_APP = originalOauthApp
  }
})

test("maps the token response to debug info with an ISO expiry", () => {
  expect(toCopilotTokenDebugInfo(tokenResponse)).toEqual({
    token: "copilot-token",
    expiresAt: 1_800_000_000,
    expiresAtIso: "2027-01-15T08:00:00.000Z",
    refreshIn: 1_500,
    apiEndpoint: "https://api.individual.githubcopilot.com",
  })
})

test("exchanges the stored GitHub token and prints JSON", async () => {
  const log = spyOn(console, "log").mockImplementation(() => {})
  const getCopilotToken = mock(() => {
    expect(state.githubToken).toBe("stored-github-token")
    return Promise.resolve(tokenResponse)
  })

  const info = await runDebugToken(
    { json: true },
    {
      getCopilotToken,
      readGitHubToken: () => Promise.resolve("stored-github-token"),
    },
  )

  expect(getCopilotToken).toHaveBeenCalledTimes(1)
  expect(info.token).toBe("copilot-token")
  expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual(info)
  log.mockRestore()
})

test("prints plain output without endpoints", async () => {
  const { endpoints: _endpoints, ...withoutEndpoints } = tokenResponse
  const info = await runDebugToken(
    { json: false },
    {
      getCopilotToken: () => Promise.resolve(withoutEndpoints),
      readGitHubToken: () => Promise.resolve("stored-github-token"),
    },
  )

  expect(info.apiEndpoint).toBeUndefined()
})

test("fails when no GitHub token is stored", () => {
  expect(
    runDebugToken(
      { json: true },
      {
        getCopilotToken: () => Promise.resolve(tokenResponse),
        readGitHubToken: () => Promise.resolve(null),
      },
    ),
  ).rejects.toThrow("GitHub token not found")
})

test("fails for the opencode OAuth app", () => {
  process.env.COPILOT_API_OAUTH_APP = "opencode"

  expect(
    runDebugToken(
      { json: true },
      {
        getCopilotToken: () => Promise.resolve(tokenResponse),
        readGitHubToken: () => Promise.resolve("stored-github-token"),
      },
    ),
  ).rejects.toThrow("opencode OAuth")
})
