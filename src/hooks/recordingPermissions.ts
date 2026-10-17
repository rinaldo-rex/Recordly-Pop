type RecordingPermissionApi = Pick<
	Window["electronAPI"],
	| "getPlatform"
	| "getScreenRecordingPermissionStatus"
	| "getAccessibilityPermissionStatus"
	| "showRecordingPermissions"
>;

// A local recording requires OS permission, not a Supabase/cloud session.
// Linux/Windows screen, microphone, and camera prompts stay in the capture APIs.
export async function prepareRecordingPermissions(api: RecordingPermissionApi): Promise<boolean> {
	if ((await api.getPlatform()) !== "darwin") return true;
	const [screen, accessibility] = await Promise.all([
		api.getScreenRecordingPermissionStatus(),
		api.getAccessibilityPermissionStatus(),
	]);
	if (
		screen.success &&
		screen.status === "granted" &&
		accessibility.success &&
		accessibility.trusted
	) {
		return true;
	}
	await api.showRecordingPermissions();
	return false;
}
