export interface GpuSwitches {
	useAngle?: string;
	useGl?: string;
	disableFeatures?: string[];
}

function normalizeLinuxWindowSystem(value: string | undefined): "wayland" | "x11" | null {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "wayland" || normalized === "x11") {
		return normalized;
	}

	return null;
}

function getForcedLinuxWindowSystem(
	env: NodeJS.ProcessEnv,
	ozonePlatform?: string,
): "wayland" | "x11" | null {
	return (
		normalizeLinuxWindowSystem(ozonePlatform) ??
		normalizeLinuxWindowSystem(env.OZONE_PLATFORM) ??
		normalizeLinuxWindowSystem(env.ELECTRON_OZONE_PLATFORM_HINT)
	);
}

export function shouldUseLinuxAngle(env: NodeJS.ProcessEnv, ozonePlatform?: string): boolean {
	const forcedWindowSystem = getForcedLinuxWindowSystem(env, ozonePlatform);
	if (forcedWindowSystem === "wayland") {
		return false;
	}
	if (forcedWindowSystem === "x11") {
		return true;
	}

	const sessionType = env.XDG_SESSION_TYPE?.toLowerCase();
	if (sessionType === "wayland") {
		return false;
	}
	if (sessionType === "x11") {
		return true;
	}

	return !env.WAYLAND_DISPLAY;
}

export function getGpuSwitches(
	platform: NodeJS.Platform,
	env: NodeJS.ProcessEnv = process.env,
	ozonePlatform?: string,
): GpuSwitches {
	if (platform === "darwin") {
		return {
			useAngle: "metal",
			disableFeatures: ["MacCatapLoopbackAudioForScreenShare"],
		};
	}

	if (platform === "win32") {
		return { useAngle: "d3d11" };
	}

	if (platform === "linux") {
		// Chromium 150 accepts ANGLE on X11, not the legacy egl-gles2 backend.
		// Keep Wayland session metadata intact so screen capture can use PipeWire.
		const useAngle = shouldUseLinuxAngle(env, ozonePlatform);
		return {
			useAngle: useAngle ? "gl" : undefined,
			useGl: useAngle ? "angle" : undefined,
			disableFeatures: ["VaapiVideoDecoder", "VaapiVideoEncoder"],
		};
	}

	return {};
}
