"use strict";
const { Driver } = require("homey");
const AlarmCom = require("node-alarm-dot-com");

module.exports = class AlarmDotComDriver extends Driver {
  async onInit() {
    this.homey.app.log("AlarmDotComDriver init");
  }

  async onPair(session) {
    let client = null;
    const creds = {
      username: "",
      password: "",
      provider: "",
      default_pin: "",
      poll_interval: 60,
    };

    // Step 1: login (username/password only)
    session.setHandler("login", async (data) => {
      creds.username = data?.username || "";
      creds.password = data?.password || "";
      this.homey.app.log("[pair] login called for", creds.username);

      try {
        AlarmCom.login(creds.username, creds.password)
          .then((authOpts) =>
            AlarmCom.getCurrentState(authOpts.systems[0], authOpts)
          )
          .catch((err) => this.homey.app.error(err));
        this.homey.app.log("[pair] login success");
        return true;
      } catch (err) {
        this.homey.app.error("[pair] login failed:", err?.message || err);
        throw new Error("Login failed: " + (err?.message || err));
      }
    });

    // Step 3: list devices
    session.setHandler("list_devices", async () => {
      try {
        // Step 1: login
        const authOpts = await AlarmCom.login(creds.username, creds.password);

        // Step 2: get current state of the first system
        const res = await AlarmCom.getCurrentState(
          authOpts.systems[0],
          authOpts
        );

        this.homey.app.log("Security Systems:", res.partitions);

        // Step 3: build devices
        const devices = res.partitions.map((myDevice) => ({
          name: myDevice.attributes.description,
          data: { id: myDevice.id },
          settings: {
            username: creds.username,
            password: creds.password,
          },
          icon: 'icons/panel.svg'
        }));

        this.homey.app.log("Devices found:", devices);

        return devices;
      } catch (err) {
        this.homey.app.error("list_devices failed:", err);
        throw new Error("Could not fetch devices: " + (err?.message || err));
      }
    });

    // Finalize when user taps "Lägg till"
    session.setHandler("add_devices", async (selection) => {
      this.homey.app.log("[pair] add_devices:", selection?.length);
      return selection;
    });

    session.setHandler("disconnect", async () => {
      this.homey.app.log("[pair] session disconnect");
      try {
        await client?.logout?.();
      } catch (_) {}
      client = null;
    });
  }
};
