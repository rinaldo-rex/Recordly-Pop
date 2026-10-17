import { useCallback, useEffect, useRef, useState } from "react";
import { loadAppSetting, saveAppSetting } from "@/lib/appSettings";
import { RecordingPermissionsDialog } from "./RecordingPermissionsDialog";

export function OnboardingController({
	requestNonce,
	ready,
}: {
	requestNonce: number;
	ready: boolean;
}) {
	const [open, setOpen] = useState(false);
	const checked = useRef(false);
	useEffect(() => {
		if (requestNonce > 0) setOpen(true);
	}, [requestNonce]);
	const close = useCallback(() => {
		saveAppSetting("recordly.onboarding.permissionsRequested", false);
		setOpen(false);
	}, []);

	useEffect(() => {
		if (!ready || checked.current) return;
		checked.current = true;
		// Local work never depends on a cloud session. Only resume an actual
		// permission request; a fresh launch must not open account onboarding.
		if (loadAppSetting<boolean>("recordly.onboarding.permissionsRequested")) setOpen(true);
	}, [ready]);

	useEffect(() => window.electronAPI.onRecordingPermissionsRequested?.(() => setOpen(true)), []);

	const finish = () => {
		close();
		void window.electronAPI.showRecordingHud();
	};

	return (
		<RecordingPermissionsDialog
			open={open}
			onOpenChange={(value) => {
				if (!value) close();
			}}
			onFinish={finish}
		/>
	);
}
