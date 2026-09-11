import { afterEach, expect, test } from "bun:test"

import { state } from "~/lib/state"
import {
  cacheMacMachineId,
  cacheVsCodeDeviceId,
  EDITOR_DEVICE_ID_ENV,
  VSCODE_MACHINE_ID_ENV,
} from "~/services/vscode-env"

const originalMachineIdEnvironment = process.env[VSCODE_MACHINE_ID_ENV]
const originalDeviceIdEnvironment = process.env[EDITOR_DEVICE_ID_ENV]
const originalMachineId = state.macMachineId
const originalDeviceId = state.vsCodeDeviceId

afterEach(() => {
  if (originalMachineIdEnvironment === undefined) {
    delete process.env[VSCODE_MACHINE_ID_ENV]
  } else {
    process.env[VSCODE_MACHINE_ID_ENV] = originalMachineIdEnvironment
  }

  if (originalDeviceIdEnvironment === undefined) {
    delete process.env[EDITOR_DEVICE_ID_ENV]
  } else {
    process.env[EDITOR_DEVICE_ID_ENV] = originalDeviceIdEnvironment
  }

  state.macMachineId = originalMachineId
  state.vsCodeDeviceId = originalDeviceId
})

test("cacheMacMachineId uses the environment override", () => {
  process.env[VSCODE_MACHINE_ID_ENV] = "  private-machine-id  "

  cacheMacMachineId()

  expect(state.macMachineId).toBe("private-machine-id")
})

test("cacheVsCodeDeviceId uses the environment override", async () => {
  process.env[EDITOR_DEVICE_ID_ENV] = "  private-device-id  "

  await cacheVsCodeDeviceId()

  expect(state.vsCodeDeviceId).toBe("private-device-id")
})
