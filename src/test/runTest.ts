import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function main() {
  const profileRoot = path.join(
    os.tmpdir(),
    `pmtsql-vscode-test-${process.pid}-${Date.now()}`
  );
  const userDataDir = path.join(profileRoot, "user-data");
  const extensionsDir = path.join(profileRoot, "extensions");

  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Download VS Code, unzip it and run the integration test
    const executablePath = process.env.VSCODE_EXECUTABLE_PATH;
    const exitCode = await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        "--user-data-dir",
        userDataDir,
        "--extensions-dir",
        extensionsDir,
      ],
      ...(executablePath
        ? { vscodeExecutablePath: executablePath }
        : { version: process.env.VSCODE_TEST_VERSION || "stable" }),
    });
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exitCode = 1;
  } finally {
    await fs.promises.rm(profileRoot, { recursive: true, force: true });
  }
}

main();
