import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface UseCameraResult {
  status: CameraStatus;
  error: string | null;
  devices: CameraDevice[];
  deviceId: string | null;
  start: (deviceId?: string) => Promise<boolean>;
  stop: () => void;
  selectDevice: (deviceId: string) => Promise<void>;
}

function describeError(error: unknown): { status: CameraStatus; message: string } {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return {
          status: "denied",
          message:
            "Camera access was blocked. Allow camera permission for this site in your browser settings, then try again.",
        };
      case "NotFoundError":
      case "OverconstrainedError":
        return {
          status: "error",
          message: "No camera was found. Connect a webcam and try again.",
        };
      case "NotReadableError":
      case "AbortError":
        return {
          status: "error",
          message: "The camera is already in use by another app. Close it and try again.",
        };
      default:
        return { status: "error", message: `Camera error: ${error.message}` };
    }
  }
  return { status: "error", message: "The camera could not be started." };
}

function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices !== "undefined" &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>): UseCameraResult {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      track.onended = null;
      track.stop();
    }
    streamRef.current = null;
    const video = videoRef.current;
    if (video && video.srcObject === stream) {
      video.srcObject = null;
    }
  }, [videoRef]);

  const refreshDevices = useCallback(async () => {
    if (!isSupported()) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cameras = all
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        }));
      setDevices(cameras);
    } catch {
      // Enumeration can fail before permission is granted; not fatal.
    }
  }, []);

  const start = useCallback(
    async (requestedDeviceId?: string): Promise<boolean> => {
      if (!isSupported()) {
        setStatus("unavailable");
        setError(
          "This browser cannot access a camera here. Use a modern browser and open the app over https or localhost.",
        );
        return false;
      }

      setStatus("requesting");
      setError(null);
      stopStream();

      const videoConstraints: MediaTrackConstraints = requestedDeviceId
        ? {
            deviceId: { exact: requestedDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          }
        : {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints,
        });

        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track) {
          const settings = track.getSettings();
          const activeId = settings.deviceId ?? requestedDeviceId ?? null;
          deviceIdRef.current = activeId;
          setDeviceId(activeId);
          track.onended = () => {
            if (streamRef.current !== stream) return;
            streamRef.current = null;
            setStatus("error");
            setError("The camera was disconnected. Reconnect it and start again.");
          };
        }

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          try {
            await video.play();
          } catch {
            // Autoplay may need the user gesture we already have; the frames
            // usually still arrive once metadata is ready.
          }
        }

        setStatus("ready");
        void refreshDevices();
        return true;
      } catch (err) {
        const described = describeError(err);
        setStatus(described.status);
        setError(described.message);
        return false;
      }
    },
    [refreshDevices, stopStream, videoRef],
  );

  const selectDevice = useCallback(
    async (nextDeviceId: string) => {
      if (nextDeviceId === deviceIdRef.current && status === "ready") return;
      await start(nextDeviceId);
    },
    [start, status],
  );

  useEffect(() => {
    if (!isSupported()) return;
    const onDeviceChange = () => {
      void refreshDevices();
    };
    navigator.mediaDevices.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener?.("devicechange", onDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(
    () => () => {
      stopStream();
    },
    [stopStream],
  );

  return { status, error, devices, deviceId, start, stop: stopStream, selectDevice };
}
