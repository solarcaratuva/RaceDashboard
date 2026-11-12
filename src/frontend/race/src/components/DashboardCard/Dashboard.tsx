import { type ReactNode } from 'react';
import "./Dashboard.css";

import PrimaryInfoCard from "../PrimaryInfoCard/PrimaryInfoCard";
import BpsCard from "../BpsCard/BpsCard"
import MotorCard from "../MotorCard/MotorCard"
import DiagnosticsCard from "../DiagnosticsCard/DiagnosticsCard"
import BpsSocGraphCard from "../BpsSocGraphCard/BpsSocGraphCard";
import ApiStatusCard from "../ApiStatusCard/ApiStatusCard";
import type { CanDashboardGroups, SocPoint } from "../CanSignalGroups/CanSignalGroups";

/** Normalized field shapes used by the legacy data-source components. */
export type PrimaryInfo = {
  speed: number;
  soc: number;
  power_in: number;
  net_power: number;
  batt_curr: number;
  batt_volt: number;
}

export type BPS = {
  packVoltage: number;
  packCurrent: number;
  soc: number;
  dischargeRelayClosed: boolean;
  chargeRelayClosed: boolean;
  chargerSafety: boolean;
  chargePowerSignal: boolean;
  balancingActive: boolean;
}

export type Motor = {
  batteryVoltage: number;
  batteryCurrent: number;
  motorCurrent: number;
  motorRpm: number;
  fetTemp: number;
  pwmDuty: number;
  acceleratorPosition: number;
  regenPosition: number;
  powerMode: string;
  controlMode: string;
  regenEnabled: boolean;
}

export type Heartbeat = {
  wheel: boolean;
  power: boolean;
  telemetry: boolean;
}

export type ConnectionInfo = {
  name: string;
  lastMs: number;
  bytesPerSec: number;
  isPrimary: boolean;
  isOnline: boolean;
}

export type Fault = {
  id: number;
  source: string;
  code: string;
  label: string;
  severity: string;
}

export type DashboardProps = {
  primaryInfo: PrimaryInfo;
  bps: BPS;
  motor: Motor;
  heartbeat: Heartbeat;
  xbee: ConnectionInfo;
  lte: ConnectionInfo;
  faults: Fault[];
  streamPanel?: ReactNode;
  /** Supplied only for XBee mode; each group is rendered inside its existing card. */
  canData?: CanDashboardGroups;
  /** Actual BpsStatus samples; the graph has no mock fallback. */
  socHistory?: SocPoint[];
}

/**
 * Compose the dashboard and route each data family into its existing card.
 * Optional CAN groups select the DBC-driven rendering path within each card;
 * they do not create a second CAN-message card.
 */
const Dashboard = ({ 
  primaryInfo, 
  bps, 
  motor, 
  heartbeat, 
  xbee, 
  lte, 
  faults,
  streamPanel,
  canData,
  socHistory,
}: DashboardProps) => {
  return (
    <div className="app-container">
      <header className="header">
        <h1>UVA Solar Car Dashboard</h1>
      </header>

      <div className="dashboard-columns">
        {/* Left column */}
        <div className="dashboard-left">
          {/* Primary CAN fields include vehicle summary, driver commands, and odometry. */}
          <PrimaryInfoCard primaryInfo={primaryInfo} canMessages={canData?.primary}/>
          <div className="secondary-info">
            {/* BPS owns pack/MPPT messages; Motor owns controller messages. */}
            <BpsCard bps={bps} canMessages={canData?.bps}/>
            <MotorCard motor={motor} canMessages={canData?.motor}/>
          </div>

          {streamPanel ? (
            <div className="secondary-info">
              {streamPanel}
            </div>
          ) : null}

          <div className="secondary-info">
            {/* <ImuCard />
            <GpsCard /> */}
          </div>
          
        </div>

        {/* Right column */}
        <div className="dashboard-right">
          <ApiStatusCard apiUrl="/api/test" />
          <DiagnosticsCard
            heartbeat={heartbeat}
            xbee={xbee}
            lte={lte}
            faults={faults}
            canMessages={canData?.diagnostics}
          />
          {/* The chart is driven by BpsStatus samples while XBee mode is active. */}
          <BpsSocGraphCard data={socHistory}/>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;