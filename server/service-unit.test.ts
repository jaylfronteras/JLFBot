import { describe, expect, it } from "vitest";

import { launchdPlist, serviceCommand, servicePlan, systemdUnit, unstableInstallWarning, type ServiceSpec } from "./service-unit.ts";

const spec: ServiceSpec = {
  node: "/usr/bin/node",
  script: "/usr/lib/node_modules/jlfbot/cli.js",
  serveArgs: ["--port", "8799", "--data-dir", "/home/jlf/.jlfbot", "--domain", "jlf.example.com", "--no-pair"],
  dataDir: "/home/jlf/.jlfbot",
  user: "jlf",
  home: "/home/jlf",
  bindsLowPorts: true,
  label: "agentada",
};

describe("service units", () => {
  it("runs the same serve command, with strip-types only for a checkout", () => {
    expect(serviceCommand(spec)).toEqual(["/usr/bin/node", "/usr/lib/node_modules/jlfbot/cli.js", "serve", ...spec.serveArgs]);
    expect(serviceCommand({ ...spec, script: "/srv/JLFBot/server/jlfbot.ts" })[1]).toBe("--experimental-strip-types");
  });

  it("renders a systemd unit that restarts, runs as the user, and grants low ports only for --domain", () => {
    const unit = systemdUnit(spec);
    expect(unit).toContain("Description=JLFBot (agentada)");
    expect(unit).toContain("User=jlf");
    expect(unit).toContain("Environment=JLFBOT_DATA_DIR=/home/jlf/.jlfbot");
    expect(unit).toContain("ExecStart=/usr/bin/node /usr/lib/node_modules/jlfbot/cli.js serve --port 8799 --data-dir /home/jlf/.jlfbot --domain jlf.example.com --no-pair");
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("AmbientCapabilities=CAP_NET_BIND_SERVICE");
    expect(unit).toContain("WantedBy=multi-user.target");
    const local = systemdUnit({ ...spec, bindsLowPorts: false, serveArgs: ["--port", "8799", "--data-dir", "/home/jlf/.jlfbot"] });
    expect(local).not.toContain("CAP_NET_BIND_SERVICE");
    // a path with a space is quoted for systemd
    expect(systemdUnit({ ...spec, dataDir: "/home/jlf/My Data", serveArgs: ["--data-dir", "/home/jlf/My Data"] })).toContain('ExecStart=/usr/bin/node /usr/lib/node_modules/jlfbot/cli.js serve --data-dir "/home/jlf/My Data"');
  });

  it("renders a launchd agent that keeps the server alive and logs under the data dir", () => {
    const plist = launchdPlist({ ...spec, home: "/Users/jlf", dataDir: "/Users/jlf/.jlfbot" });
    expect(plist).toContain("<string>com.jlfbot.serve</string>");
    expect(plist).toContain("<string>/usr/bin/node</string>");
    expect(plist).toContain("<string>serve</string>");
    expect(plist).toContain("<string>jlf.example.com</string>");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain("/Users/jlf/.jlfbot/logs/service.log");
    expect(launchdPlist({ ...spec, serveArgs: ["--label", "a & b <c>"] })).toContain("<string>a &amp; b &lt;c&gt;</string>");
  });

  it("refuses to point a service at an npx cache, and knows where each platform's file goes", () => {
    expect(unstableInstallWarning("/home/jlf/.npm/_npx/abc123/node_modules/jlfbot/cli.js")).toMatch(/npm install -g jlfbot/);
    expect(unstableInstallWarning("/usr/lib/node_modules/jlfbot/cli.js")).toBeNull();
    const linux = servicePlan("linux", "/home/jlf/.jlfbot");
    expect(linux?.installed).toBe("/etc/systemd/system/jlfbot.service");
    expect(linux?.activate.join("\n")).toContain("systemctl enable --now jlfbot");
    const mac = servicePlan("darwin", "/Users/jlf/.jlfbot", "/Users/jlf");
    expect(mac?.installed).toBe("/Users/jlf/Library/LaunchAgents/com.jlfbot.serve.plist");
    expect(mac?.activate.join("\n")).toContain("launchctl bootstrap gui/$(id -u)");
    expect(servicePlan("win32", "C:\\x")).toBeNull();
  });
});
