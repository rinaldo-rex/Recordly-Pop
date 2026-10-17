import { expect, type Page, test } from "@playwright/test";
import { installDesktopBridge } from "./bridge";

async function openPermissions(page: Page) {
	await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible({
		timeout: 15000,
	});
	await page.getByRole("radio", { name: "Settings", exact: true }).click();
	await page.getByRole("button", { name: "Show onboarding" }).click();
	return page.getByRole("dialog", { name: "Recording permissions" });
}

for (const signedIn of [false, true]) {
	test(`fresh local startup does not require account setup (signed in: ${signedIn})`, async ({
		page,
	}) => {
		await installDesktopBridge(page, "preview.mp4", { signedIn });
		await page.addInitScript(() => {
			window.electronAPI.getAppSetting = () => null;
		});
		await page.goto("/?windowType=editor");
		await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
		await page.getByRole("radio", { name: "Settings", exact: true }).click();
		await expect(page.getByRole("dialog", { name: "Welcome to Recordly" })).toHaveCount(0);
		await expect(page.getByRole("dialog", { name: "Recording permissions" })).toHaveCount(0);
		await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
		await page.reload();
		await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
		await page.getByRole("radio", { name: "Settings", exact: true }).click();
		await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
	});
}

test("a guest can finish permission setup without creating a cloud session", async ({ page }) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.addInitScript(() => {
		window.electronAPI.setAppSetting = (key, value) => {
			localStorage.setItem(key, JSON.stringify(value));
			return true;
		};
	});
	await page.goto("/?windowType=editor");
	const permissions = await openPermissions(page);
	await expect(
		permissions.getByRole("heading", { name: "Allow Recordly to record" }),
	).toBeVisible();
	await expect(permissions.getByText("Allowed", { exact: true })).toHaveCount(2);
	await expect(permissions.getByRole("button", { name: "Back to account" })).toHaveCount(0);
	await expect(permissions.getByRole("textbox")).toHaveCount(0);
	await permissions.getByRole("button", { name: "Start recording", exact: true }).click();
	await expect(permissions).not.toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("data-hud-opened", "true");
	expect(
		await page.evaluate(() => localStorage.getItem("recordly.onboarding.permissionsRequested")),
	).toBe("false");
	expect(await page.evaluate(() => localStorage.getItem("sb-auth-auth-token"))).toBeNull();
	await page.reload();
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
	await expect(permissions).not.toBeVisible();
});

test("permission setup fits compact windows without showing an account step", async ({ page }) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/?windowType=editor");
	const permissions = await openPermissions(page);
	for (const viewport of [
		{ width: 720, height: 780 },
		{ width: 640, height: 650 },
		{ width: 390, height: 600 },
	]) {
		await page.setViewportSize(viewport);
		await expect(
			permissions.getByRole("button", { name: "Start recording", exact: true }),
		).toBeInViewport();
		await expect
			.poll(() => permissions.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
			.toBe(true);
	}
	await expect(permissions.getByRole("navigation", { name: "Onboarding pages" })).toHaveCount(0);
	await page.screenshot({
		path: "test-results/offline-recording-permissions.png",
		animations: "disabled",
	});
});

test("macOS permissions still block guest recording until access is granted", async ({ page }) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.addInitScript(() => {
		let screen = false;
		let accessibility = false;
		Object.assign(window.electronAPI, {
			getScreenRecordingPermissionStatus: async () => ({
				success: true,
				status: screen ? "granted" : "denied",
			}),
			getAccessibilityPermissionStatus: async () => ({
				success: true,
				trusted: accessibility,
			}),
			openScreenRecordingPreferences: async () => {
				screen = true;
				document.documentElement.dataset.screenSettings = "true";
				return { success: true };
			},
			openAccessibilityPreferences: async () => {
				accessibility = true;
				document.documentElement.dataset.accessibilitySettings = "true";
				return { success: true };
			},
		});
	});
	await page.goto("/?windowType=editor");
	const permissions = await openPermissions(page);
	const start = permissions.getByRole("button", { name: "Start recording", exact: true });
	await expect(start).toBeDisabled();
	await expect(page.locator("html")).not.toHaveAttribute("data-screen-settings");
	await permissions.getByRole("button", { name: "Allow Screen Recording", exact: true }).click();
	await expect(start).toBeDisabled();
	await permissions.getByRole("button", { name: "Allow Accessibility", exact: true }).click();
	await expect(start).toBeEnabled();
	await expect(permissions.getByText("Allowed", { exact: true })).toHaveCount(2);
	await start.click();
	await expect(permissions).not.toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("data-hud-opened", "true");
	expect(await page.evaluate(() => localStorage.getItem("sb-auth-auth-token"))).toBeNull();
});

for (const platform of ["win32", "linux"]) {
	test(`${platform} guest permission setup skips macOS-only permission APIs`, async ({
		page,
	}) => {
		await installDesktopBridge(page, "preview.mp4", { signedIn: false });
		await page.addInitScript((platform) => {
			window.electronAPI.getPlatform = async () => platform;
			window.electronAPI.getScreenRecordingPermissionStatus = async () => {
				throw new Error("macOS-only check");
			};
			window.electronAPI.getAccessibilityPermissionStatus = async () => {
				throw new Error("macOS-only check");
			};
		}, platform);
		await page.goto("/?windowType=editor");
		const permissions = await openPermissions(page);
		await expect(permissions.getByText("Screen Recording", { exact: true })).toHaveCount(0);
		await expect(
			permissions.getByRole("button", { name: "Start recording", exact: true }),
		).toBeEnabled();
		await permissions.getByRole("button", { name: "Start recording", exact: true }).click();
		await expect(page.locator("html")).toHaveAttribute("data-hud-opened", "true");
	});
}

for (const platform of ["darwin", "win32", "linux"]) {
	test(`${platform} HUD does not require a Supabase session to prepare recording`, async ({
		page,
	}) => {
		await installDesktopBridge(page, "preview.mp4", { signedIn: false });
		await page.addInitScript((platform) => {
			window.electronAPI.getPlatform = async () => platform;
		}, platform);
		await page.goto("/?windowType=hud-overlay");
		await expect(page.getByRole("button", { name: "Record", exact: true })).toBeEnabled();
		await expect(page.locator("html")).not.toHaveAttribute("data-permissions-opened");
	});
}

test("HUD routes missing OS permissions to setup without opening System Settings automatically", async ({
	page,
}) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.addInitScript(() => {
		window.electronAPI.getScreenRecordingPermissionStatus = async () => ({
			success: true,
			status: "denied",
		});
		window.electronAPI.openScreenRecordingPreferences = async () => {
			document.documentElement.dataset.settingsOpened = "true";
			return { success: true };
		};
	});
	await page.goto("/?windowType=hud-overlay");
	await expect(page.locator("html")).toHaveAttribute("data-permissions-opened", "true");
	await expect(page.locator("html")).not.toHaveAttribute("data-settings-opened");
});

test("a pending permission request opens permission setup for a guest, not sign-in", async ({
	page,
}) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.addInitScript(() => {
		window.electronAPI.getAppSetting = (key) =>
			key === "recordly.onboarding.permissionsRequested" ? true : null;
	});
	await page.goto("/?windowType=editor");
	const permissions = page.getByRole("dialog", { name: "Recording permissions" });
	await expect(
		permissions.getByRole("heading", { name: "Allow Recordly to record" }),
	).toBeVisible();
	await expect(permissions.getByRole("textbox")).toHaveCount(0);
	await permissions.getByRole("button", { name: "Close", exact: true }).click();
	await expect(permissions).not.toBeVisible();
});

test("permission requests can arrive after guest startup", async ({ page }) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.addInitScript(() => {
		window.electronAPI.onRecordingPermissionsRequested = (callback) => {
			const listener = () => callback();
			window.addEventListener("test-request-permissions", listener);
			return () => window.removeEventListener("test-request-permissions", listener);
		};
	});
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
	await page.evaluate(() => window.dispatchEvent(new Event("test-request-permissions")));
	await expect(page.getByRole("dialog", { name: "Recording permissions" })).toBeVisible();
	await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
});
