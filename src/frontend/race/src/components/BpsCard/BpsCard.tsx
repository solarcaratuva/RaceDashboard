import "./BpsCard.css";
import CanSignalGroups from "../CanSignalGroups/CanSignalGroups";
import type { CanMessageSignals } from "../CanSignalGroups/CanSignalGroups";

/** Existing normalized battery fields used by legacy payloads. */
type Bps = {
    packVoltage: number;
    packCurrent: number;
    soc: number;
    dischargeRelayClosed: boolean;
    chargeRelayClosed: boolean;
    chargerSafety: boolean;
    chargePowerSignal: boolean;
    balancingActive: boolean;
}

type BpsCardProps = {
    bps: Bps;
    /** BPS and MPPT DBC frames when the active backend stream is XBee. */
    canMessages?: CanMessageSignals[];
}

export default function BpsCard({ bps, canMessages }: BpsCardProps) {
  return (
    <div className="secondary-block">
        <h4 className="block-label">BPS</h4>

        {/* The XBee branch shows every decoded BPS/MPPT signal; the legacy branch
            keeps its established units and field labels. */}
        {canMessages !== undefined ? (
          <CanSignalGroups messages={canMessages} />
        ) : (
          <>
        <div className="secondary-row">
          <span>Pack Voltage</span>
          <span className="secondary-value">
              {bps?.packVoltage ?? 0} V
          </span>
        </div>

        <div className="secondary-row">
          <span>Pack Current</span>
          <span className="secondary-value">
              {bps?.packCurrent ?? 0} A
          </span>
        </div>

        <div className="secondary-row">
          <span>Pack SoC</span>
          <span className="secondary-value">
              {bps?.soc ?? 0} %
          </span>
        </div>

        <div className="secondary-row">
          <span>Discharge Relay</span>
          <span className="secondary-value">
              {String(bps?.dischargeRelayClosed ?? false)}
          </span>
        </div>

        <div className="secondary-row">
          <span>Charge Relay</span>
          <span className="secondary-value">
              {String(bps?.chargeRelayClosed ?? false)}
          </span>
        </div>

        <div className="secondary-row">
          <span>Charger Safety</span>
          <span className="secondary-value">
              {String(bps?.chargerSafety ?? false)}
          </span>
        </div>

        <div className="secondary-row">
          <span>Charge Power Signal</span>
          <span className="secondary-value">
              {String(bps?.chargePowerSignal ?? false)}
          </span>
        </div>

        <div className="secondary-row">
          <span>Balancing</span>
          <span className="secondary-value">
              {String(bps?.balancingActive ?? false)}
          </span>
        </div>
          </>
        )}
    </div>
  );
}
