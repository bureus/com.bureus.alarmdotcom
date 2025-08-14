'use strict';

const Homey = require('homey');

class AlarmDotComApp extends Homey.App {

  async onInit() {
    this.log('Alarm.com app started');

    // Register flow trigger
    this.stateTrigger = this.homey.flow.getDeviceTriggerCard('state_changed');
  }
}

module.exports = AlarmDotComApp;
