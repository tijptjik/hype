// TYPES
import type { CameraPermissionStatus } from '$lib/types'

export type CameraAccessState = {
  hasCameraDevice: boolean
  permissionStatus: CameraPermissionStatus
}

/**
 * Detects camera hardware presence and any available permission state without prompting.
 *
 * @returns Camera availability snapshot for the current browser environment.
 */
export async function detectCameraAccess(): Promise<CameraAccessState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return {
      hasCameraDevice: false,
      permissionStatus: 'denied',
    }
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const hasCameraDevice = devices.some(device => device.kind === 'videoinput')

    if (!hasCameraDevice) {
      return {
        hasCameraDevice,
        permissionStatus: 'denied',
      }
    }

    let permissionStatus: CameraPermissionStatus = 'prompt'

    if (navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({
          name: 'camera' as PermissionName,
        })

        if (permission.state === 'granted') {
          permissionStatus = 'granted'
        } else if (permission.state === 'denied') {
          permissionStatus = 'denied'
        } else {
          permissionStatus = 'prompt'
        }
      } catch {
        permissionStatus = 'prompt'
      }
    }

    return {
      hasCameraDevice,
      permissionStatus,
    }
  } catch {
    return {
      hasCameraDevice: false,
      permissionStatus: 'denied',
    }
  }
}

/**
 * Requests camera permission and immediately releases the acquired stream.
 *
 * @returns The resulting permission status after the browser prompt resolves.
 */
export async function requestCameraAccess(): Promise<CameraPermissionStatus> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'denied'
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    })

    stream.getTracks().forEach(track => {
      track.stop()
    })

    return 'granted'
  } catch {
    return 'denied'
  }
}
