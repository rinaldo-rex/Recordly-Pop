const fs = require("node:fs/promises");
const path = require("node:path");

// Run before electron-builder generates AppRun, so both the AppImage and the
// unpacked Linux executable enter the same launcher before Electron starts.
module.exports = async function installLinuxLauncher(context) {
	if (context.electronPlatformName !== "linux") {
		return;
	}

	const executablePath = path.join(context.appOutDir, context.packager.executableName);
	const binaryPath = `${executablePath}.bin`;
	const launcher = await fs.readFile(path.join(__dirname, "linux-launcher.sh"), "utf8");

	// Preserve the original executable's permissions (and leave bundled native
	// helpers alone). Do not silently overwrite an earlier packaged binary.
	try {
		await fs.access(binaryPath);
		throw new Error(`Linux launcher is already installed at ${executablePath}`);
	} catch (error) {
		if (error.code !== "ENOENT") {
			throw error;
		}
	}

	await fs.rename(executablePath, binaryPath);
	await fs.writeFile(executablePath, launcher, { mode: 0o755 });
};
