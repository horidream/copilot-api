import { state } from "~/lib/state"
import {
  logUser,
  setupCopilotToken,
  type SetupCopilotTokenOptions,
} from "~/lib/token"
import { cacheModels } from "~/services/copilot/models-cache"
import {
  cacheMacMachineId,
  cacheVSCodeVersion,
  cacheVsCodeSessionId,
  cacheVsCodeDeviceId,
} from "~/services/vscode-env"

export async function setupCopilotRuntime(
  githubToken: string,
  copilotTokenOptions?: SetupCopilotTokenOptions,
): Promise<void> {
  state.githubToken = githubToken
  await logUser()
  await cacheVSCodeVersion()
  cacheMacMachineId()
  cacheVsCodeSessionId()
  await cacheVsCodeDeviceId()
  await setupCopilotToken(undefined, copilotTokenOptions)
  await cacheModels()
}
