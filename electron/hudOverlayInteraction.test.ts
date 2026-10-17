import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const workArea = { x: 100, y: 50, width: 1920, height: 1080 };
	const screen = {
		getPrimaryDisplay: () => ({ workArea }),
		getDisplayMatching: () => ({ workArea }),
		on: vi.fn(),
		removeListener: vi.fn(),
	};
	const listeners = new Map<string, (event: unknown, value: boolean) => void>();
	return { screen, listeners };
});

vi.mock("node:module", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:module")>()),
	createRequire: () => () => ({ screen: mocks.screen }),
}));
vi.mock("./appPaths", () => ({ USER_DATA_PATH: "/tmp/recordly-hud-interaction-test" }));
vi.mock("./ipc/state", () => ({
	currentProjectPath: null,
	currentVideoPath: null,
	currentRecordingSession: null,
}));
vi.mock("./rendererServer", () => ({ getPackagedRendererBaseUrl: () => null }));
vi.mock("electron", () => ({
	app: { isReady: () => true },
	ipcMain: {
		on: (channel: string, listener: (event: unknown, value: boolean) => void) => {
			mocks.listeners.set(channel, listener);
		},
		handle: vi.fn(),
		removeListener: vi.fn(),
	},
	BrowserWindow: vi.fn().mockImplementation(function (options) {
		let bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
		return {
			getBounds: () => ({ ...bounds }),
			setBounds: vi.fn((next) => {
				bounds = { ...next };
			}),
			isDestroyed: () => false,
			isVisible: () => false,
			setAlwaysOnTop: vi.fn(),
			setContentProtection: vi.fn(),
			setIgnoreMouseEvents: vi.fn(),
			on: vi.fn(),
			once: vi.fn(),
			loadFile: vi.fn(),
			webContents: { on: vi.fn(), send: vi.fn() },
		};
	}),
}));

describe("Linux HUD interaction IPC", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.listeners.clear();
		vi.stubGlobal("process", { ...process, platform: "linux" });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("expands for menus and collapses without moving the toolbar's bottom edge", async () => {
		const { createHudOverlayWindow } = await import("./windows");
		const win = createHudOverlayWindow();
		const initial = win.getBounds();
		expect(initial.height).toBe(160);
		const setIgnore = mocks.listeners.get("hud-overlay-set-ignore-mouse");
		if (!setIgnore) throw new Error("HUD interaction IPC listener was not registered");

		setIgnore({}, false);
		const expanded = win.getBounds();
		expect(expanded.height).toBe(540);
		expect(expanded.y + expanded.height).toBe(initial.y + initial.height);
		expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);

		setIgnore({}, true);
		expect(win.getBounds()).toEqual(initial);
		expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
	});
});
