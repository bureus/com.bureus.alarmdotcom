"use strict";
const { Device } = require("homey");
const AlarmCom = require("node-alarm-dot-com");

module.exports = class AlarmDotComDevice extends Device {
  async onInit() {
    this.log("Alarm.com device init");

    // Read settings from pairing
    const username = this.getSetting("username");
    const password = this.getSetting("password");

    this.log("Device credentials:", { username });

    // If you support multiple partitions:
    this.partitionId = this.getData()?.id ?? 0;

    // Dashboard controls
    this.registerCapabilityListener("onoff", async (value) => {
      const pin = this.getSetting("default_pin") || undefined;
      if (value) {
        await this.armAway(pin);
        await this._reflectControls("away");
      } else {
        await this.disarm(pin);
        await this._reflectControls("disarmed");
      }
    });

    this.registerCapabilityListener("arm_mode", async (mode) => {
      const pin = this.getSetting("default_pin") || undefined;
      if (mode === "away") await this.armAway(pin);
      else if (mode === "stay") await this.armStay(pin);
      else await this.disarm(pin);
      await this._reflectControls(mode);
    });

    // Quick-action buttons
    this.registerCapabilityListener("arm_stay_button", async () => {
      const pin = this.getSetting("default_pin") || undefined;
      await this.armStay(pin);
      await this._reflectControls("stay");
    });

    this.registerCapabilityListener("arm_away_button", async () => {
      const pin = this.getSetting("default_pin") || undefined;
      await this.armAway(pin);
      await this._reflectControls("away");
    });

    this._pollInterval = null;
    await this._connect();
    this._startPolling();
  }

  async onSettings(oldSettings, newSettings, changed) {
    if (changed.some((k) => ["username", "password", "provider"].includes(k))) {
      await this._connect(true);
    }
    if (changed.includes("poll_interval")) {
      this._stopPolling();
      this._startPolling();
    }
  }

  async _connect(force = false) {
    if (this.authOpts && !force) {
      this.log("Using existing auth, force=", force);
      return;
    }

    const username = this.getSetting("username");
    const password = this.getSetting("password");

    if (!username || !password) {
      this.error("Missing credentials in settings");
      this.setUnavailable("Missing credentials");
      return;
    }

    try {
      this.log("Attempting login for user:", username);
      const authOpts = await AlarmCom.login(username, password);
      this.authOpts = authOpts;

      if (!authOpts.systems || !authOpts.systems[0]) {
        throw new Error("No systems found");
      }

      this.log("Login successful, systems found:", authOpts.systems.length);

      // Get first system's state
      this.currentState = await AlarmCom.getCurrentState(
        authOpts.systems[0],
        authOpts
      );

      this.log("Initial state fetched:", {
        systemId: authOpts.systems[0],
        state: this.currentState.partitions[0]?.attributes?.state,
        armType: this.currentState.partitions[0]?.attributes?.armType,
      });

      await this._pollOnce(); // Update initial state in Homey
      this.setAvailable();
    } catch (err) {
      this.authOpts = null;
      this.error("Login failed with error:", err?.message || err);
      this.setUnavailable("Login failed: " + (err?.message || err));
    }
  }

  _startPolling() {
    const interval = this.getSetting("poll_interval") || 60;
    this.log(`Starting polling with interval: ${interval} seconds`);

    this._stopPolling();

    this._pollInterval = setInterval(async () => {
      await this._pollOnce();
    }, interval * 1000);

    this.log("Polling started successfully");
  }

  _stopPolling() {
    if (this._pollInterval) {
      this.log("Stopping existing poll interval");
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  async _pollOnce() {
    try {
      const state = await this._getStateFromClient();
      const partition = state?.partitions?.[0];
      
      if (!partition) {
        this.error('No partition data found');
        return;
      }

      const stateRaw = partition.attributes.state;
      this.log("Current raw state:", { stateRaw });

      // Map API states to Homey states
      let homeyState = "disarmed";
      let mode = "disarmed";
      
      switch (stateRaw) {
        case 1: // DISARMED
          homeyState = "disarmed";
          mode = "disarmed";
          break;
        case 2: // ARMED_STAY
          homeyState = "partially_armed";
          mode = "armed_stay";
          break;
        case 3: // ARMED_AWAY
          homeyState = "armed";
          mode = "armed_away";
          break;
        case 4: // ARMED_NIGHT
          homeyState = "partially_armed";
          mode = "armed_night";
          break;
        case 0: // UNKNOWN
          this.log("System state unknown");
          return;
        default:
          this.log("Unknown state received:", stateRaw);
          return;
      }

      // Update capabilities if changed
      const prevMode = this.getCapabilityValue("arm_mode");
      if (prevMode !== mode) {
        await this.setCapabilityValue("arm_mode", mode);
        await this.setCapabilityValue("homealarm_state", homeyState);
        
        // Add timeline entry
        await this.homey.flow.getDeviceTriggerCard('state_changed').trigger(this, {
          state: mode,
          previous_state: prevMode || 'unknown',
          raw_state: stateRaw
        });

        // Create timeline entry
        await this.homey.insights.createLog('alarm_state_changes', {
          message: `Alarm state changed from ${prevMode || 'unknown'} to ${mode}`,
          severity: mode === 'disarmed' ? 'info' : 'notice',
          timestamp: new Date(),
          metadata: {
            from: prevMode || 'unknown',
            to: mode,
            raw_state: stateRaw
          }
        });
      }

      await this._reflectControls(mode);
    } catch (err) {
      this.error("Polling error:", err?.message || err);
      if (err.message.includes("auth")) {
        await this._connect(true);
      }
    }
  }

  async _reflectControls(mode) {
    const desiredOn = mode === "away";
    if (this.getCapabilityValue("onoff") !== desiredOn)
      await this.setCapabilityValue("onoff", desiredOn);
    if (this.getCapabilityValue("arm_mode") !== mode)
      await this.setCapabilityValue("arm_mode", mode);
  }

  // Flow condition helper
  isState(target) {
    const cur = this.getCapabilityValue("homealarm_state");
    if (target === "away") return cur === "armed";
    if (target === "stay") return cur === "partially_armed";
    if (target === "disarmed") return cur === "disarmed";
    return false;
  }

  // Actions used by Flow cards and dashboard
  async armAway(pin) {
    await this._doClientAction("armAway", "away", pin);
  }

  async armStay(pin) {
    await this._doClientAction("armStay", "stay", pin);
  }

  async disarm(pin) {
    await this._doClientAction("disarm", "disarmed", pin);
  }

  async _doClientAction(kind, mode, pin) {
    try {
      if (!this.authOpts?.systems?.[0]) {
        this.error("Action attempted without auth:", kind);
        throw new Error("Not connected");
      }

      const systemId = this.authOpts.systems[0];

      // Desired state mapping:
      // armAway -> state 2 (ARMED_AWAY)
      // armStay -> state 3 (ARMED_STAY)
      // disarm -> state 1 (DISARMED)

      this.log("Executing action:", {
        kind,
        mode,
        systemId,
        hasPin: !!pin,
        desiredState: kind === "armAway" ? 2 : kind === "armStay" ? 3 : 1,
      });

      switch (kind) {
        case "armAway":
          await AlarmCom.armAway(systemId, this.authOpts, pin);
          // System might go to state 8 (ARMING) temporarily
          break;
        case "armStay":
          await AlarmCom.armStay(systemId, this.authOpts, pin);
          // System might go to state 8 (ARMING) temporarily
          break;
        case "disarm":
          await AlarmCom.disarm(systemId, this.authOpts, pin);
          break;
        default:
          throw new Error(`Unknown action: ${kind}`);
      }

      // Poll twice with delay to catch both immediate and final states
      await this._refreshSoon();
    } catch (err) {
      this.error(`${kind} action failed:`, err?.message || err);
      throw err;
    }
  }

  async _getStateFromClient() {
    if (!this.authOpts?.systems?.[0]) {
      this.error("State check attempted without auth");
      throw new Error("Not connected");
    }

    const state = await AlarmCom.getCurrentState(
      this.authOpts.systems[0],
      this.authOpts
    );

    this.log("State received:", {
      state: state.partitions[0]?.attributes?.state,
      armType: state.partitions[0]?.attributes?.armType,
      timestamp: new Date().toISOString(),
    });

    return state;
  }

  async _refreshSoon() {
    await this._pollOnce().catch(() => {});
    setTimeout(() => this._pollOnce().catch(() => {}), 3000);
  }

  // Clean up on device deletion
  async onDeleted() {
    this.log("Device deleted, stopping polling");
    this._stopPolling();
  }
};
