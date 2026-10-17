import { describe, expect, it, vi } from "vitest";
import { prepareRecordingPermissions } from "./recordingPermissions";

type Api = Parameters<typeof prepareRecordingPermissions>[0];

function permissionApi(platform: "darwin" | "linux" | "win32") {
	return {
		getPlatform: vi.fn<Api["getPlatform"]>().mockResolvedValue(platform),
		getScreenRecordingPermissionStatus: vi
			.fn<Api["getScreenRecordingPermissionStatus"]>()
			.mockResolvedValue({ success: true, status: "granted" }),
		getAccessibilityPermissionStatus: vi
			.fn<Api["getAccessibilityPermissionStatus"]>()
			.mockResolvedValue({ success: true, trusted: true }),
		showRecordingPermissions: vi
			.fn<Api["showRecordingPermissions"]>()
			.mockResolvedValue(undefined),
	};
}

describe("local recording permissions", () => {
	it.each([
		"linux",
		"win32",
	] as const)("allows %s recording without a cloud session", async (platform) => {
		const api = permissionApi(platform);
		await expect(prepareRecordingPermissions(api)).resolves.toBe(true);
		expect(api.getScreenRecordingPermissionStatus).not.toHaveBeenCalled();
		expect(api.getAccessibilityPermissionStatus).not.toHaveBeenCalled();
		expect(api.showRecordingPermissions).not.toHaveBeenCalled();
	});

	it("allows macOS recording when OS access is granted, without requiring an account", async () => {
		const api = permissionApi("darwin");
		await expect(prepareRecordingPermissions(api)).resolves.toBe(true);
		expect(api.getScreenRecordingPermissionStatus).toHaveBeenCalledOnce();
		expect(api.getAccessibilityPermissionStatus).toHaveBeenCalledOnce();
		expect(api.showRecordingPermissions).not.toHaveBeenCalled();
	});

	it("keeps missing screen permission blocking recording on macOS", async () => {
		const api = permissionApi("darwin");
		api.getScreenRecordingPermissionStatus.mockResolvedValue({
			success: true,
			status: "denied",
		});
		await expect(prepareRecordingPermissions(api)).resolves.toBe(false);
		expect(api.showRecordingPermissions).toHaveBeenCalledOnce();
	});

	it("keeps missing Accessibility permission blocking recording on macOS", async () => {
		const api = permissionApi("darwin");
		api.getAccessibilityPermissionStatus.mockResolvedValue({ success: true, trusted: false });
		await expect(prepareRecordingPermissions(api)).resolves.toBe(false);
		expect(api.showRecordingPermissions).toHaveBeenCalledOnce();
	});

	it("does not treat a failed OS permission check as granted access", async () => {
		const api = permissionApi("darwin");
		api.getScreenRecordingPermissionStatus.mockResolvedValue({
			success: false,
			status: "unknown",
		});
		await expect(prepareRecordingPermissions(api)).resolves.toBe(false);
		expect(api.showRecordingPermissions).toHaveBeenCalledOnce();
	});
});
