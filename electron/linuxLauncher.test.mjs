import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import installLinuxLauncher from "../scripts/after-pack-linux.cjs";

const displayKeys = ["DISPLAY", "WAYLAND_DISPLAY", "XDG_SESSION_TYPE", "XDG_CURRENT_DESKTOP"];

describe.skipIf(process.platform !== "linux")("packaged Linux launcher", () => {
	let root;
	let executable;
	let env;
	let context;

	beforeEach(async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "recordly launcher "));
		executable = path.join(root, "recordly");
		context = {
			electronPlatformName: "linux",
			appOutDir: root,
			packager: { executableName: "recordly" },
		};
		await writeFile(
			executable,
			'#!/bin/bash\nprintf "%s\\0" "${DISPLAY-}" "${WAYLAND_DISPLAY-}" "${XDG_SESSION_TYPE-}" "${XDG_CURRENT_DESKTOP-}" "$@"\n',
			{ mode: 0o755 },
		);
		await mkdir(path.join(root, "commands"));
		await writeFile(
			path.join(root, "commands", "systemctl"),
			'#!/bin/bash\nif [[ "${TEST_SESSION_STATUS:-0}" != "0" ]]; then exit "$TEST_SESSION_STATUS"; fi\nprintf "%s\\n" "${TEST_SESSION_ENV:-}"\n',
			{ mode: 0o755 },
		);
		env = { ...process.env, PATH: `${path.join(root, "commands")}:/usr/bin:/bin` };
		for (const key of [...displayKeys, "ELECTRON_RUN_AS_NODE"]) delete env[key];
		await installLinuxLauncher(context);
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	function launch(args = []) {
		const result = spawnSync(executable, args, { env, encoding: "utf8" });
		return { ...result, fields: result.stdout.split("\0").slice(0, -1) };
	}

	it("recovers both drawing and capture metadata before starting Electron", () => {
		env.TEST_SESSION_ENV = [
			"DISPLAY=:1",
			"WAYLAND_DISPLAY=wayland-1",
			"XDG_SESSION_TYPE=wayland",
			"XDG_CURRENT_DESKTOP=COSMIC",
		].join("\n");
		const result = launch([
			"--example",
			"a file with spaces.recordly",
			"recordly://auth?x=1&y=2",
		]);
		expect(result.status).toBe(0);
		expect(result.fields).toEqual([
			":1",
			"wayland-1",
			"wayland",
			"COSMIC",
			"--ozone-platform=x11",
			"--example",
			"a file with spaces.recordly",
			"recordly://auth?x=1&y=2",
		]);
	});

	it("preserves explicitly supplied desktop variables", () => {
		Object.assign(env, {
			DISPLAY: ":9",
			WAYLAND_DISPLAY: "wayland-9",
			XDG_SESSION_TYPE: "x11",
			XDG_CURRENT_DESKTOP: "custom",
			TEST_SESSION_ENV:
				"DISPLAY=:1\nWAYLAND_DISPLAY=wayland-1\nXDG_SESSION_TYPE=wayland\nXDG_CURRENT_DESKTOP=COSMIC",
		});
		expect(launch().fields).toEqual([
			":9",
			"wayland-9",
			"x11",
			"custom",
			"--ozone-platform=x11",
		]);
	});

	it("does not evaluate session output or import unrelated settings", async () => {
		const marker = path.join(root, "must-not-exist");
		env.TEST_SESSION_ENV = `DISPLAY=:1\nUNRELATED=$(touch '${marker}')\nWAYLAND_DISPLAY=$(touch '${marker}')`;
		const result = launch();
		expect(result.status).toBe(0);
		expect(result.fields[1]).toBe(`$(touch '${marker}')`);
		await expect(stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("does not require a working session manager when DISPLAY is already set", () => {
		env.DISPLAY = ":1";
		env.TEST_SESSION_STATUS = "1";
		expect(launch().status).toBe(0);
	});

	it("reports a missing desktop instead of crashing Electron", () => {
		env.TEST_SESSION_STATUS = "1";
		const result = launch();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("DISPLAY is unset");
		expect(result.stdout).toBe("");
	});

	it("preserves Electron's headless Node mode and its arguments", () => {
		env.ELECTRON_RUN_AS_NODE = "1";
		env.TEST_SESSION_STATUS = "1";
		const result = launch(["-p", "process.versions.electron"]);
		expect(result.status).toBe(0);
		expect(result.fields).toEqual(["", "", "", "", "-p", "process.versions.electron"]);
	});

	it("preserves executable permissions and rejects a second wrapper installation", async () => {
		expect((await stat(executable)).mode & 0o111).toBe(0o111);
		expect((await stat(`${executable}.bin`)).mode & 0o111).toBe(0o111);
		const binary = await readFile(`${executable}.bin`, "utf8");
		await expect(installLinuxLauncher(context)).rejects.toThrow("already installed");
		expect(await readFile(`${executable}.bin`, "utf8")).toBe(binary);
	});

	it("does not modify other platforms", async () => {
		await chmod(executable, 0o700);
		const before = await readFile(executable, "utf8");
		for (const platform of ["darwin", "win32"]) {
			await installLinuxLauncher({ ...context, electronPlatformName: platform });
		}
		expect(await readFile(executable, "utf8")).toBe(before);
		expect((await stat(executable)).mode & 0o777).toBe(0o700);
	});
});
