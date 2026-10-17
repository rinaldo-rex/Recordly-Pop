import { describe, expect, it } from "vitest";

import { getGpuSwitches, shouldUseLinuxAngle } from "./gpuSwitches";

describe("shouldUseLinuxAngle", () => {
	it("does not force ANGLE in a native Wayland session", () => {
		expect(
			shouldUseLinuxAngle({
				XDG_SESSION_TYPE: "wayland",
				WAYLAND_DISPLAY: "wayland-0",
			}),
		).toBe(false);
	});

	it("respects Wayland explicitly requested via Ozone", () => {
		expect(shouldUseLinuxAngle({ OZONE_PLATFORM: "wayland", XDG_SESSION_TYPE: "x11" })).toBe(
			false,
		);
	});

	it("falls back to Electron's ozone hint when OZONE_PLATFORM is invalid", () => {
		expect(
			shouldUseLinuxAngle({
				OZONE_PLATFORM: "auto",
				ELECTRON_OZONE_PLATFORM_HINT: "wayland",
				XDG_SESSION_TYPE: "x11",
			}),
		).toBe(false);
	});

	it("uses ANGLE on X11", () => {
		expect(shouldUseLinuxAngle({ XDG_SESSION_TYPE: "x11" })).toBe(true);
	});

	it("respects X11 requested via Electron's ozone hint", () => {
		expect(
			shouldUseLinuxAngle({
				ELECTRON_OZONE_PLATFORM_HINT: "x11",
				WAYLAND_DISPLAY: "wayland-0",
			}),
		).toBe(true);
	});

	it("prioritizes the launcher's X11 command line over Wayland session metadata", () => {
		const env = {
			XDG_SESSION_TYPE: "wayland",
			WAYLAND_DISPLAY: "wayland-1",
			OZONE_PLATFORM: "wayland",
		};
		expect(shouldUseLinuxAngle(env, "x11")).toBe(true);
		expect(env.WAYLAND_DISPLAY).toBe("wayland-1");
		expect(env.XDG_SESSION_TYPE).toBe("wayland");
	});

	it("respects an explicit Wayland command line even with X11 environment hints", () => {
		expect(shouldUseLinuxAngle({ OZONE_PLATFORM: "x11" }, "wayland")).toBe(false);
	});
});

describe("getGpuSwitches", () => {
	it("keeps the VAAPI workaround without forcing a renderer on native Wayland", () => {
		expect(
			getGpuSwitches("linux", { XDG_SESSION_TYPE: "wayland", WAYLAND_DISPLAY: "wayland-0" }),
		).toEqual({
			useAngle: undefined,
			useGl: undefined,
			disableFeatures: ["VaapiVideoDecoder", "VaapiVideoEncoder"],
		});
	});

	it("uses supported ANGLE/OpenGL instead of legacy EGL on Linux X11", () => {
		expect(getGpuSwitches("linux", { XDG_SESSION_TYPE: "x11" })).toEqual({
			useAngle: "gl",
			useGl: "angle",
			disableFeatures: ["VaapiVideoDecoder", "VaapiVideoEncoder"],
		});
	});

	it("uses ANGLE for XWayland without changing the Wayland capture environment", () => {
		const env = { XDG_SESSION_TYPE: "wayland", WAYLAND_DISPLAY: "wayland-1" };
		expect(getGpuSwitches("linux", env, "x11")).toMatchObject({
			useAngle: "gl",
			useGl: "angle",
		});
		expect(env).toEqual({ XDG_SESSION_TYPE: "wayland", WAYLAND_DISPLAY: "wayland-1" });
	});

	it("does not change macOS or Windows graphics backends", () => {
		expect(getGpuSwitches("darwin", {}, "x11")).toEqual({
			useAngle: "metal",
			disableFeatures: ["MacCatapLoopbackAudioForScreenShare"],
		});
		expect(getGpuSwitches("win32", {}, "x11")).toEqual({ useAngle: "d3d11" });
	});
});
