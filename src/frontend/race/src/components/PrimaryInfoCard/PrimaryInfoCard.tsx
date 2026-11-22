import "./PrimaryInfoCard.css";
import CanSignalGroups from "../CanSignalGroups/CanSignalGroups";
import type { CanMessageSignals } from "../CanSignalGroups/CanSignalGroups";

/**
 * Legacy summary fields retained for non-XBee stream sources. XBee content
 * uses decoded DBC signals instead because the DBC is the authoritative schema.
 */
type PrimaryInfo = {
    speed: number;
    soc: number;
    power_in: number;
    net_power: number;
    batt_curr: number;
    batt_volt: number;
}


type PrimaryInfoCardProps = {
  primaryInfo: PrimaryInfo;
  /** Present for XBee mode, including an empty list before matching frames arrive. */
  canMessages?: CanMessageSignals[];
}; 

export default function PrimaryInfoCard({ primaryInfo, canMessages }: PrimaryInfoCardProps) {
  return (
    <section className="card card-primary">
      {/* Undefined means use the existing legacy summary; [] means XBee is active but has no messages yet. */}
      {canMessages === undefined ? (
        <div className="primary-grid">
          <div className="stat">Speed
            <h1 className="value">{ primaryInfo?.speed ?? 0 } mph</h1>
          </div>
          <div className="stat">Pack SoC
            <h1 className="value">{ primaryInfo?.soc ?? 0 }%</h1>
          </div>
          <div className="stat">Solar Power In
            <h1 className="value">{ primaryInfo?.power_in ?? 0 } W</h1>
          </div>
          <div className="stat">Net Pack Power
            <h1 className="value">{ primaryInfo?.net_power ?? 0 } W</h1>
          </div>
          <div className="stat">Batt Curr
            <h1 className="value">{ primaryInfo?.batt_curr ?? 0} A</h1>
          </div>
          <div className="stat">Batt Volt
            <h1 className="value">{ primaryInfo?.batt_volt ?? 0} V</h1>
          </div>
        </div>
      ) : (
        <>
          <h3 className="card-title">Vehicle & Driver Controls</h3>
          {/* Render all signals assigned to the primary/driver group without losing DBC field names. */}
          <CanSignalGroups messages={canMessages} />
        </>
      )}
    </section>
  );
}
