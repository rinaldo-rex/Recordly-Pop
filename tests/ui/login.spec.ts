import { expect, type Page, test } from "@playwright/test";
import { completeSupabaseSignIn } from "./auth";
import { installDesktopBridge } from "./bridge";

async function openSignIn(page: Page) {
	await page.getByRole("button", { name: "Recordly account", exact: true }).click();
	const login = page.getByRole("dialog").filter({
		has: page.getByRole("textbox", { name: /^Email\*?$/ }),
	});
	await expect(login).toBeVisible();
	return login;
}

test("local export is available to guests while cloud sharing still requests sign-in", async ({
	page,
}) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.goto("/?windowType=editor");
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
	await page.getByRole("button", { name: "Publish", exact: true }).click();
	await page.getByRole("row", { name: "Local", exact: true }).click();
	await expect(page.getByRole("button", { name: "Export Video", exact: true })).toBeEnabled();
	await expect(page.getByRole("textbox", { name: /^Email\*?$/ })).toHaveCount(0);
	await page.getByRole("row", { name: "Link", exact: true }).click();
	await page.getByRole("button", { name: "Sign in to share", exact: true }).click();
	await expect(page.getByRole("textbox", { name: /^Email\*?$/ })).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem("sb-auth-auth-token"))).toBeNull();
});

test("optional sign-in offers only providers enabled in Supabase", async ({ page }) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.route("https://auth.recordly.test/auth/v1/settings", (route) =>
		route.fulfill({
			json: { external: { google: true, azure: false, github: false, email: true } },
		}),
	);
	await page.goto("/?windowType=editor");
	const login = await openSignIn(page);
	await expect(
		login.getByRole("button", { name: "Continue with Google", exact: true }),
	).toBeVisible();
	await expect(
		login.getByRole("button", { name: "Continue with Microsoft", exact: true }),
	).toHaveCount(0);
	await expect(
		login.getByRole("button", { name: "Continue with GitHub", exact: true }),
	).toHaveCount(0);
	const email = login.getByRole("textbox", { name: /^Email\*?$/ });
	const magicLink = login.getByRole("button", { name: "Email me a magic link" });
	await expect(magicLink).toHaveCount(0);
	await email.fill("owner@example");
	await expect(magicLink).toHaveCount(0);
	await email.fill("owner@example.test");
	await expect(magicLink).toBeEnabled();
	await email.clear();
	await expect(magicLink).toHaveCount(0);
	await login.getByRole("button", { name: "Close", exact: true }).click();
	await expect(login).not.toBeVisible();
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
});

test("email sign-in reports errors and retries without fabricating a cloud session", async ({
	page,
}) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	let attempts = 0;
	await page.route("https://auth.recordly.test/auth/v1/otp**", async (route) => {
		attempts++;
		if (attempts === 1)
			return route.fulfill({
				status: 429,
				json: { msg: "Please wait before requesting another email." },
			});
		return route.fulfill({ json: {} });
	});
	await page.goto("/?windowType=editor");
	const login = await openSignIn(page);
	await login.getByRole("textbox", { name: /^Email\*?$/ }).fill("owner@example.test");
	await login.getByRole("button", { name: "Email me a magic link" }).click();
	await expect(login.getByText("Please wait before requesting another email.")).toBeVisible();
	await login.getByRole("button", { name: "Email me a magic link" }).click();
	await expect(login.getByText(/Check your inbox/)).toBeVisible();
	expect(attempts).toBe(2);
	expect(await page.evaluate(() => localStorage.getItem("sb-auth-auth-token"))).toBeNull();
});

test("a rejected callback does not grant a cloud session and local use remains available", async ({
	page,
}) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.route("https://auth.recordly.test/auth/v1/token**", (route) =>
		route.fulfill({
			status: 400,
			json: { error: "invalid_grant", error_description: "Sign-in link has expired" },
		}),
	);
	await page.goto("/?windowType=editor");
	const login = await openSignIn(page);
	await login.getByRole("textbox", { name: /^Email\*?$/ }).fill("owner@example.test");
	await login.getByRole("button", { name: "Email me a magic link" }).click();
	await expect(login.getByText(/Check your inbox/)).toBeVisible();
	await completeSupabaseSignIn(page);
	await expect(login.getByText("Sign-in link has expired")).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem("sb-auth-auth-token"))).toBeNull();
	await login.getByRole("button", { name: "Close", exact: true }).click();
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
});

for (const [label, provider] of [
	["Google", "google"],
	["Microsoft", "azure"],
	["GitHub", "github"],
]) {
	test(`${label} optional sign-in opens Supabase OAuth in the system browser`, async ({
		page,
	}) => {
		await installDesktopBridge(page, "preview.mp4", { signedIn: false });
		await page.addInitScript(() => {
			window.electronAPI.openExternalUrl = async (url) => {
				document.documentElement.dataset.authUrl = url;
				return { success: true };
			};
		});
		await page.goto("/?windowType=editor");
		const login = await openSignIn(page);
		await login.getByRole("button", { name: `Continue with ${label}`, exact: true }).click();
		await expect(page.locator("html")).toHaveAttribute("data-auth-url", /auth\/v1\/authorize/);
		const url = new URL((await page.locator("html").getAttribute("data-auth-url"))!);
		expect(url.origin).toBe("https://auth.recordly.test");
		expect(url.searchParams.get("provider")).toBe(provider);
		expect(url.searchParams.get("redirect_to")).toBe("http://127.0.0.1:43821/auth/callback");
		expect(url.searchParams.get("code_challenge")).toBeTruthy();
		await expect(login).toBeVisible();
	});
}

test("a successful email callback authenticates optional cloud sign-in", async ({ page }) => {
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.goto("/?windowType=editor");
	const login = await openSignIn(page);
	await login.getByRole("textbox", { name: /^Email\*?$/ }).fill("test@email.com");
	const otpRequest = page.waitForRequest((request) => request.url().includes("/auth/v1/otp"));
	await login.getByRole("button", { name: "Email me a magic link" }).click();
	expect((await otpRequest).postDataJSON()).toMatchObject({
		email: "test@email.com",
		create_user: true,
	});
	await expect(login.getByText(/Check your inbox/)).toBeVisible();
	const exchange = page.waitForRequest((request) => request.url().includes("/auth/v1/token"));
	await completeSupabaseSignIn(page);
	expect((await exchange).postDataJSON()).toMatchObject({
		auth_code: "ui-auth-code",
		code_verifier: expect.any(String),
	});
	await expect(login).not.toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem("sb-auth-auth-token"))).not.toBeNull();
});

test("signing out keeps local use available and does not reopen account onboarding", async ({
	page,
}) => {
	await installDesktopBridge(page);
	await page.goto("/?windowType=editor");
	await page.getByRole("button", { name: "Recordly account", exact: true }).click();
	const account = page.getByRole("dialog", { name: "Your account", exact: true });
	await expect(account.getByText("test@email.com")).toBeVisible();
	const logout = page.waitForRequest((request) => request.url().includes("/auth/v1/logout"));
	await account.getByRole("button", { name: "Sign out", exact: true }).click();
	await logout;
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem("sb-auth-auth-token"))).toBeNull();
});

test("optional email sign-in remains usable in a short window", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await installDesktopBridge(page, "preview.mp4", { signedIn: false });
	await page.goto("/?windowType=editor");
	const login = await openSignIn(page);
	await page.setViewportSize({ width: 390, height: 600 });
	await login.getByRole("textbox", { name: /^Email\*?$/ }).fill("owner@example.test");
	const submit = login.getByRole("button", { name: "Email me a magic link" });
	await submit.scrollIntoViewIfNeeded();
	await expect(submit).toBeInViewport();
	await submit.click();
	await expect(login.getByText(/Check your inbox/)).toBeVisible();
	await expect(login.getByRole("navigation", { name: "Onboarding pages" })).toHaveCount(0);
	await page.screenshot({ path: "test-results/optional-sign-in.png", animations: "disabled" });
});
