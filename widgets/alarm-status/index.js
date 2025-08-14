const stateIcons = {
  disarmed: '../../assets/icons/disarmed.svg',
  armed_away: '../../assets/icons/armed-away.svg',
  armed_stay: '../../assets/icons/armed-stay.svg',
  armed_night: '../../assets/icons/armed-night.svg'
};

const stateNames = {
  disarmed: 'Disarmed',
  armed_away: 'Armed Away',
  armed_stay: 'Armed Stay',
  armed_night: 'Armed Night'
};

module.exports = class AlarmStatusWidget {
  async onInit() {
    this.stateElement = document.getElementById('stateName');
    this.iconElement = document.getElementById('stateIcon');
    this.timestampElement = document.getElementById('lastChange');

    // Listen for capability changes
    this.device = await this.homey.devices.getDevice({
      id: this.options.deviceId,
    });

    this.device.on('capability.arm_mode', this.updateState.bind(this));
    
    // Initial state
    await this.updateState();
  }

  async updateState() {
    const state = await this.device.getCapabilityValue('arm_mode');
    
    // Update icon
    this.iconElement.src = stateIcons[state] || stateIcons.disarmed;
    
    // Update state name
    this.stateElement.textContent = stateNames[state] || 'Unknown';
    this.stateElement.parentElement.dataset.state = state;
    
    // Update timestamp
    const now = new Date();
    this.timestampElement.textContent = `Last changed: ${now.toLocaleTimeString()}`;
  }
}
