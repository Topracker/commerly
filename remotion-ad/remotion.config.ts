import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(null);
// Sandbox não tem saída pra baixar o Chrome Headless Shell do Remotion —
// usa o Chromium do Playwright que já vem instalado no ambiente.
Config.setBrowserExecutable("/opt/pw-browsers/chromium-1243/chrome-linux64/chrome");
