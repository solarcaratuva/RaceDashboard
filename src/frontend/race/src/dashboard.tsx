import { useState, useEffect } from 'react';
import { socket } from './util/socket';
import Dashboard from './components/DashboardCard/Dashboard';
import RawDataPanel from './components/RawDataPanel/RawDataPanel';
import type { PrimaryInfo, BPS, Motor, Heartbeat, ConnectionInfo, Fault } from './components/DashboardCard/Dashboard';
import type {
  CanDashboardGroups,
  CanGroupName,
  CanMessageSignals,
  CanSignalValue,
  SocPoint,
} from './components/CanSignalGroups/CanSignalGroups';

export type BackendSource = 'cloud' | 'xbee' | 'legacy' | 'unknown';

/** Shape stored for the raw Backend Stream panel independently of card state. */
type RawStreamEntry = {
  id: string;
  source: BackendSource;
  timestamp: number;
  rawData: string;
  messageName: string | null;
  signals: Record<string, unknown> | null;
  original: unknown;
};

type StreamRecord = Record<string, unknown>;

/** Narrow untrusted Socket.IO JSON objects before reading their properties. */
function isStreamRecord(value: unknown): value is StreamRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Accept only JSON primitives that the shared DBC signal renderer supports. */
function isCanSignalRecord(value: unknown): value is Record<string, CanSignalValue> {
  return isStreamRecord(value)
    && Object.values(value).every((signal) =>
      signal === null
      || typeof signal === 'string'
      || typeof signal === 'number'
      || typeof signal === 'boolean',
    );
}

/** Read typed legacy values without permitting strings/objects to become metrics. */
function numberField(record: StreamRecord, key: string): number {
  const value = record[key];
  return typeof value === 'number' ? value : 0;
}

/** Read a strict boolean field from a legacy payload. */
function booleanField(record: StreamRecord, key: string): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : false;
}

/** Read a strict string field from a legacy payload with an explicit fallback. */
function stringField(record: StreamRecord, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

/**
 * Map each loaded DBC message family into an existing dashboard area.
 * Unrecognized messages intentionally fall through to diagnostics so decoded
 * fields remain visible rather than being silently dropped.
 */
function groupForMessage(messageName: string): CanGroupName {
  if (['AuxBatteryStatus', 'MotorCommands', 'DashboardCommands', 'OdometryData'].includes(messageName)) {
    return 'primary';
  }
  if (
    messageName.startsWith('Bps')
    || /^MG[01](Status|OutputVoltageInputPower|PCBMOSFETTemperature)$/.test(messageName)
  ) {
    return 'bps';
  }
  if (messageName.startsWith('MotorController')) {
    return 'motor';
  }
  return 'diagnostics';
}

const DashboardWrapper = () => {
  // Shared state for the legacy dashboard cards; kept for sources that still
  // emit normalized battery/motor payloads instead of DBC-decoded CAN frames.
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

  const [heartbeat] = useState<Heartbeat>({
    wheel: false,
    power: false,
    telemetry: false,
  });

  const [xbee] = useState<ConnectionInfo>({
    name: 'XBee',
    lastMs: 0,
    bytesPerSec: 0,
    isPrimary: true,
    isOnline: false,
  });

  const [lte] = useState<ConnectionInfo>({
    name: 'LTE',
    lastMs: 0,
    bytesPerSec: 0,
    isPrimary: false,
    isOnline: false,
  });

  const [faults] = useState<Fault[]>([]);
  const [backendSource, setBackendSource] = useState<BackendSource>('unknown');
  const [streamHistory, setStreamHistory] = useState<RawStreamEntry[]>([]);
  // Keep one latest frame per message for the cards; the raw panel separately
  // retains a bounded event history to show recent individual frames.
  const [canMessages, setCanMessages] = useState<CanMessageSignals[]>([]);
  // Preserve a recent sequence of SoC samples for plotting instead of keeping
  // only the latest BpsStatus value.
  const [socHistory, setSocHistory] = useState<SocPoint[]>([]);
  // Derive card groups from the latest message state so routing stays centralized.
  const canData = canMessages.reduce<CanDashboardGroups>((groups, message) => {
    groups[groupForMessage(message.messageName)].push(message);
    return groups;
  }, { primary: [], bps: [], motor: [], diagnostics: [] });

  useEffect(() => {
    // Listen for the unified backend stream event and preserve compatibility
    // with the old `pull_db` event name until the backend is fully migrated.
    const handleStream = (data: unknown) => {
      if (!Array.isArray(data)) {
        return;
      }

      const items: unknown[] = data;
      if (items.length === 0) {
        return;
      }

      const firstItem = items[0];
      // Detect the event format from its first record. The backend emits a
      // homogeneous batch, so this determines which parser handles the batch.
      const source: BackendSource = isStreamRecord(firstItem) && firstItem.source === 'xbee'
        ? 'xbee'
        : isStreamRecord(firstItem) && firstItem.source === 'cloud'
        ? 'cloud'
        : isStreamRecord(firstItem) && isStreamRecord(firstItem.payload)
        ? 'legacy'
        : 'unknown';
      setBackendSource(source);

      if (source === 'xbee') {
        // Preserve the original frame and raw bytes for the Backend Stream panel.
        const entries = items.flatMap((item): RawStreamEntry[] => {
          if (!isStreamRecord(item)) {
            return [];
          }
          return [{
            id: stringField(item, 'messageId', ''),
            source: 'xbee',
            timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now() / 1000,
            rawData: stringField(item, 'rawData', ''),
            messageName: typeof item.messageName === 'string' ? item.messageName : null,
            signals: isStreamRecord(item.signals) ? item.signals : null,
            original: item,
          }];
        });
        setStreamHistory((prev) => [...entries, ...prev].slice(0, 20));

        // Filter out undecoded or malformed records before passing data into
        // the dashboard cards, which rely on message names and signal objects.
        const decodedMessages: CanMessageSignals[] = items.flatMap((value) => {
          if (!isStreamRecord(value) || !isCanSignalRecord(value.signals)) {
            return [];
          }
          if (typeof value.messageId !== 'string' || typeof value.messageName !== 'string') {
            return [];
          }
          return [{
            id: value.messageId,
            messageName: value.messageName,
            timestamp: typeof value.timestamp === 'number' ? value.timestamp : Date.now() / 1000,
            signals: value.signals,
          }];
        });

        // Messages recur throughout a live stream. Replacing by ID + DBC name
        // makes each card show the latest signal values for each message type.
        setCanMessages((previous) => {
          const messagesById = new Map(
            previous.map((message) => [`${message.id}-${message.messageName}`, message]),
          );
          decodedMessages.forEach((message) => {
            messagesById.set(`${message.id}-${message.messageName}`, message);
          });
          return Array.from(messagesById.values());
        });

        // The graph uses the BPS DBC's physical pack_soc value and its replay
        // timestamp; unrelated signals/messages do not create chart points.
        const socSamples = decodedMessages.flatMap((message) => {
          const soc = message.signals.pack_soc;
          return message.messageName === 'BpsStatus' && typeof soc === 'number'
            ? [{ timestamp: message.timestamp, soc }]
            : [];
        });
        if (socSamples.length > 0) {
          setSocHistory((previous) => [...previous, ...socSamples].slice(-200));
        }
        return;
      }

      if (source === 'legacy') {
        // Legacy `pull_db` payloads are expected to include `struct_name`, so
        // map those records into the same dashboard updates used by the new stream.
        const entries: RawStreamEntry[] = [];
        items.forEach((value) => {
          if (!isStreamRecord(value)) {
            return;
          }
          const item = value;
          const raw = item.payload;
          if (!isStreamRecord(raw)) {
            return;
          }

          const structName = raw.struct_name;
          if (structName === 'motor') {
            setMotor({
              batteryVoltage: numberField(raw, 'battery_voltage_mc'),
              batteryCurrent: numberField(raw, 'battery_current_mc'),
              motorCurrent: numberField(raw, 'motor_current'),
              motorRpm: numberField(raw, 'motor_rpm'),
              fetTemp: numberField(raw, 'fet_temp'),
              pwmDuty: numberField(raw, 'pwm_duty'),
              acceleratorPosition: numberField(raw, 'accel_position'),
              regenPosition: numberField(raw, 'regen_position'),
              powerMode: stringField(raw, 'power_mode', 'STANDBY'),
              controlMode: stringField(raw, 'control_mode', 'TORQUE'),
              regenEnabled: booleanField(raw, 'regen'),
            });
          }

          if (structName === 'battery') {
            const parsedBps: BPS = {
              packVoltage: numberField(raw, 'pack_voltage'),
              packCurrent: numberField(raw, 'pack_current'),
              soc: numberField(raw, 'pack_soc'),
              dischargeRelayClosed: booleanField(raw, 'discharge_relay'),
              chargeRelayClosed: booleanField(raw, 'charge_relay'),
              chargerSafety: booleanField(raw, 'charger_safety'),
              chargePowerSignal: booleanField(raw, 'charge_power_signal'),
              balancingActive: booleanField(raw, 'balancing'),
            };
            setBps(parsedBps);
            setPrimaryInfo({
              speed: numberField(raw, 'speed'),
              soc: numberField(raw, 'pack_soc'),
              power_in: numberField(raw, 'solar_power_in'),
              net_power: numberField(raw, 'net_pack_power'),
              batt_curr: numberField(raw, 'batt_current'),
              batt_volt: numberField(raw, 'batt_voltage'),
            });
          }

          entries.push({
            id: stringField(raw, 'id', stringField(raw, 'message_id', '')),
            source: 'legacy',
            timestamp: Date.now(),
            rawData: JSON.stringify(raw, null, 2),
            messageName: typeof structName === 'string' ? structName : null,
            signals: raw,
            original: raw,
          });
        });
        setStreamHistory((prev) => [...entries, ...prev].slice(0, 20));
        return;
      }

      if (source === 'cloud') {
        const entries = items.flatMap((item): RawStreamEntry[] => {
          if (!isStreamRecord(item)) {
            return [];
          }
          return [{
            id: stringField(item, 'id', stringField(item, 'message_id', '')),
            source: 'cloud',
            timestamp: Date.now(),
            rawData: JSON.stringify(item, null, 2),
            messageName: typeof item.struct_name === 'string' ? item.struct_name : null,
            signals: item,
            original: item,
          }];
        });
        setStreamHistory((prev) => [...entries, ...prev].slice(0, 20));
      }
    };

    socket.on('backend_data_stream', handleStream);
    socket.on('pull_db', handleStream); // Keep compatibility with legacy backend naming.

    return () => {
      socket.off('backend_data_stream', handleStream);
      socket.off('pull_db', handleStream);
    };
  }, []);

  return (
    <>
      {/* Undefined preserves the existing legacy component rendering path;
          an empty group object marks XBee mode before any frames arrive. */}
      <Dashboard
        primaryInfo={primaryInfo}
        bps={bps}
        motor={motor}
        heartbeat={heartbeat}
        xbee={xbee}
        lte={lte}
        faults={faults}
        canData={backendSource === 'xbee' ? canData : undefined}
        socHistory={backendSource === 'xbee' ? socHistory : undefined}
        streamPanel={<RawDataPanel backendSource={backendSource} entries={streamHistory} />}
      />
    </>
  );
};

export default DashboardWrapper;
