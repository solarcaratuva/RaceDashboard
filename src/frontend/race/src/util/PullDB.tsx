import { socket } from "./socket"
import { useState, useEffect } from 'react';
import Dashboard from '../components/DashboardCard/Dashboard';
import type { PrimaryInfo, BPS, Motor, Heartbeat, ConnectionInfo, Fault } from '../components/DashboardCard/Dashboard';

const PullDB = () => {
  // Initialize state with some defaults
  const [primaryInfo, setPrimaryInfo] = useState<PrimaryInfo>({
    speed: 0,
    soc: 0,
    power_in: 0,
    net_power: 0,
    batt_curr: 0,
    batt_volt: 0,
  });

  const [bps, setBps] = useState<BPS>({
    packVoltage: 0,
    packCurrent: 0,
    soc: 0,
    dischargeRelayClosed: false,
    chargeRelayClosed: false,
    chargerSafety: false,
    chargePowerSignal: false,
    balancingActive: false,
  });

  const [motor, setMotor] = useState<Motor>({
    batteryVoltage: 0,
    batteryCurrent: 0,
    motorCurrent: 0,
    motorRpm: 0,
    fetTemp: 0,
    pwmDuty: 0,
    acceleratorPosition: 0,
    regenPosition: 0,
    powerMode: 'STANDBY',
    controlMode: 'TORQUE',
    regenEnabled: false,
  });

  const [heartbeat, setHeartbeat] = useState<Heartbeat>({
    wheel: false,
    power: false,
    telemetry: false,
  });

  const [xbee, setXbee] = useState<ConnectionInfo>({
    name: 'XBee',
    lastMs: 0,
    bytesPerSec: 0,
    isPrimary: true,
    isOnline: false,
  });

  const [lte, setLte] = useState<ConnectionInfo>({
    name: 'LTE',
    lastMs: 0,
    bytesPerSec: 0,
    isPrimary: false,
    isOnline: false,
  });

  const [faults, setFaults] = useState<Fault[]>([]);


// Update all state every 0.1 second (set in socketIO pull_db event emission frequency in backend)
useEffect(() => {
  socket.on('pull_db', (data: any[]) => {
    data.forEach((item) => {
      const raw = item.payload;
      const structName = raw?.struct_name;

      if (structName === 'motor') {
        const parsedMotor: Motor = {
          batteryVoltage: raw.battery_voltage_mc ?? 0,
          batteryCurrent: raw.battery_current_mc ?? 0,
          motorCurrent: raw.motor_current ?? 0,
          motorRpm: raw.motor_rpm ?? 0,
          fetTemp: raw.fet_temp ?? 0,
          pwmDuty: raw.pwm_duty ?? 0,
          acceleratorPosition: raw.accel_position ?? 0,
          regenPosition: raw.regen_position ?? 0,
          powerMode: raw.power_mode ?? 'STANDBY',
          controlMode: raw.control_mode ?? 'TORQUE',
          regenEnabled: raw.regen ?? false,
        };
        setMotor(parsedMotor);
      }

      if (structName === 'battery') {
        const parsedBps: BPS = {
          packVoltage: raw.pack_voltage ?? 0,
          packCurrent: raw.pack_current ?? 0,
          soc: raw.pack_soc ?? 0,
          dischargeRelayClosed: raw.discharge_relay ?? false,
          chargeRelayClosed: raw.charge_relay ?? false,
          chargerSafety: raw.charger_safety ?? false,
          chargePowerSignal: raw.charge_power_signal ?? false,
          balancingActive: raw.balancing ?? false,
        };
        setBps(parsedBps);

        const parsedPrimaryInfo: PrimaryInfo = {
          speed: raw.speed ?? 0,
          soc: raw.pack_soc ?? 0,
          power_in: raw.solar_power_in ?? 0,
          net_power: raw.net_pack_power ?? 0,
          batt_curr: raw.batt_current ?? 0,
          batt_volt: raw.batt_voltage ?? 0,
        };
        setPrimaryInfo(parsedPrimaryInfo);
      }
    });
  });

  return () => {
    socket.off('pull_db');
  };
}, []);

  return (
    <Dashboard
      primaryInfo={primaryInfo}
      bps={bps}
      motor={motor}
      heartbeat={heartbeat}
      xbee={xbee}
      lte={lte}
      faults={faults}
    />
  );
};

export default PullDB;
