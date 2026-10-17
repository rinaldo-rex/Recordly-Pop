import { Modal } from "@heroui/react";
import { OnboardingPermissions } from "./OnboardingPermissions";

// Keep local OS permissions separate from the optional cloud account dialog.
export function RecordingPermissionsDialog({
	open,
	onOpenChange,
	onFinish,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onFinish: () => void;
}) {
	return (
		<Modal isOpen={open} onOpenChange={onOpenChange}>
			<Modal.Backdrop>
				<Modal.Container size="cover" placement="center" className="p-4">
					<Modal.Dialog
						aria-label="Recording permissions"
						className="relative max-h-[calc(100dvh-32px)] w-full max-w-[720px] gap-0 overflow-y-auto rounded-3xl p-0"
					>
						<OnboardingPermissions onFinish={onFinish} />
						<Modal.CloseTrigger aria-label="Close" />
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}
