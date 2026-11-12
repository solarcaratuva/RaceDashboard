import { useState, useEffect } from 'react';
import Dashboard from '../DashboardCard/Dashboard';
import type { PrimaryInfo, BPS, Motor, Heartbeat, ConnectionInfo, Fault } from '../DashboardCard/Dashboard';

const DataGenerator = () => {
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

  // Helper for random numbers rounded to integer
  const randomIntInRange = (min: number, max: number) =>
    Math.round(min + Math.random() * (max - min));

  // Update all state every second
  useEffect(() => {
    const interval = setInterval(() => {
      setPrimaryInfo({
        speed: randomIntInRange(0, 60),
        soc: randomIntInRange(0, 100),
        power_in: randomIntInRange(0, 1200),
        net_power: randomIntInRange(0, 2000),
        batt_curr: randomIntInRange(-50, 50),
        batt_volt: randomIntInRange(120, 160),
      });

      setBps({
        packVoltage: randomIntInRange(120, 160),
        packCurrent: randomIntInRange(-50, 50),
        soc: randomIntInRange(0, 100),
        dischargeRelayClosed: Math.random() > 0.5,
        chargeRelayClosed: Math.random() > 0.5,
        chargerSafety: Math.random() > 0.5,
        chargePowerSignal: Math.random() > 0.5,
        balancingActive: Math.random() > 0.5,
      });

      setMotor({
        batteryVoltage: randomIntInRange(120, 160),
        batteryCurrent: randomIntInRange(-50, 50),
        motorCurrent: randomIntInRange(0, 100),
        motorRpm: randomIntInRange(0, 3000),
        fetTemp: randomIntInRange(20, 90),
        pwmDuty: randomIntInRange(0, 100),
        acceleratorPosition: randomIntInRange(0, 100),
        regenPosition: randomIntInRange(0, 100),
        powerMode: Math.random() > 0.5 ? 'RUN' : 'STANDBY',
        controlMode: 'TORQUE',
        regenEnabled: Math.random() > 0.5,
      });

      setHeartbeat({
        wheel: Math.random() > 0.2,
        power: Math.random() > 0.2,
        telemetry: Math.random() > 0.2,
      });

      setXbee({
        name: 'XBee',
        lastMs: randomIntInRange(10, 200),
        bytesPerSec: randomIntInRange(0, 50),
        isPrimary: true,
        isOnline: Math.random() > 0.2,
      });

      setLte({
        name: 'LTE',
        lastMs: randomIntInRange(10, 1500),
        bytesPerSec: randomIntInRange(0, 50),
        isPrimary: false,
        isOnline: Math.random() > 0.3,
      });

      setFaults([
        { id: 1, source: 'BPS', code: 'test', label: 'Low Voltage', severity: 'warning' },
        { id: 2, source: 'Motor', code: 'overheat', label: 'High Temp', severity: 'fault' },
      ]);
    }, 1000);

    return () => clearInterval(interval);
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

export default DataGenerator;
