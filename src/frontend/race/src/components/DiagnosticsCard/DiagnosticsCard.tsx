import './DiagnosticsCard.css'
import ConnectionRow from '../TransmissionStatusCard/TransmissionStatusCard';
import CanSignalGroups from '../CanSignalGroups/CanSignalGroups';
import type { CanMessageSignals } from '../CanSignalGroups/CanSignalGroups';

type HeartbeatProps = {
    wheel: boolean;
    power: boolean;
    telemetry: boolean;
}

/** Transport metrics retained for XBee/LTE connection status rows. */
type ConnectionProps = {
    name: string;
    lastMs: number;
    bytesPerSec: number;
    isPrimary: boolean;
    isOnline: boolean;
}

/** Legacy fault shape retained for non-XBee status payloads. */
type FaultProps = {
    id: number;
    source: string;
    code: string;
    label: string;
    severity: string;
}[]

type DiagnosticProps = {
    heartbeat?: HeartbeatProps,
    xbee?: ConnectionProps,
    lte?: ConnectionProps,
    faults?: FaultProps,
    /** DBC frames not assigned to the primary, BPS/MPPT, or motor cards. */
    canMessages?: CanMessageSignals[],
}

export default function DiagnosticsCard({ heartbeat, xbee, lte, faults, canMessages }: DiagnosticProps) {
    // Keep safe defaults for callers that do not yet supply the legacy diagnostics props.
    const safeHeartbeat = heartbeat ?? { wheel: false, power: false, telemetry: false };
    const safeXbee = xbee ?? { name: 'XBee', lastMs: 0, bytesPerSec: 0, isPrimary: true, isOnline: false };
    const safeLte = lte ?? { name: 'LTE', lastMs: 0, bytesPerSec: 0, isPrimary: false, isOnline: false };
    const safeFaults = faults ?? [];

    return (
        <div className="card">
            <h3 className='card-title'>Car Diagnostics</h3>

            <h4 className="sub-label">Transmission Status</h4>

            <div className="tx-row">
                <ConnectionRow label="XBee" status={safeXbee} />
            </div>
            <div className="tx-row">
                <ConnectionRow label="LTE" status={safeLte} />
            </div>

            {/* Connection health remains useful in either data mode. Only the
                vehicle-data portion switches between decoded DBC and legacy fields. */}
            {canMessages !== undefined ? (
                <>
                    <hr className="card-separator" />
                    <h4 className="sub-label">Vehicle Status & Telemetry</h4>
                    <CanSignalGroups messages={canMessages} />
                </>
            ) : (
                <>
            {/* These indicators and synthesized fault rows belong to the older
                payload format; XBee DBC signals are rendered directly above. */}
            <hr className="card-separator" />
            <h4 className="sub-label">Heartbeat Status</h4>
            <div className="heartbeat-section">
                <div className="heartbeat-row">
                    <span className="tx-label">Wheel Board</span>
                    <span className={`hb-status ${safeHeartbeat.wheel ? "hb-ok" : "hb-bad"}`}>
                        <span className="hb-dot" />
                        {safeHeartbeat.wheel ? "Alive" : "No heartbeat"}
                    </span>
                </div>

                <div className="heartbeat-row">
                    <span className="tx-label">Power Board</span>
                    <span className={`hb-status ${safeHeartbeat.power ? "hb-ok" : "hb-bad"}`}>
                        <span className="hb-dot" />
                        {safeHeartbeat.power ? "Alive" : "No heartbeat"}
                    </span>
                </div>

                <div className="heartbeat-row">
                    <span className="tx-label">Telemetry Board</span>
                    <span className={`hb-status ${safeHeartbeat.telemetry ? "hb-ok" : "hb-bad"}`}>
                        <span className="hb-dot" />
                        {safeHeartbeat.telemetry ? "Alive" : "No heartbeat"}
                    </span>
                </div>
            </div>

            <hr className="card-separator" />
            
            <h4 className="sub-label">
                Faults & Errors{" "}
                <span className={`fault-count-badge ${safeFaults.length ? "has-faults" : ""}`}>
                    {safeFaults.length} active
                </span>
            </h4>

            <div className="fault-list">
                {safeFaults.length === 0 ? (
                    <div className="fault-row fault-row-empty">No active faults</div>
                ) : (
                    safeFaults.map(f => (
                        <div key={f.id} className="fault-row">
                            <span className={`fault-pill fault-pill-${f.source?.toLowerCase() ?? 'unknown'}`}>
                                {f.source ?? 'Unknown'}
                            </span>
                            <span className="fault-label">{f.label ?? 'Unknown fault'}</span>
                            <span
                                className={
                                    "fault-severity " +
                                    ((f.severity ?? '') === "fault" ? "fault-severity-critical" : "fault-severity-warning")
                                }
                            >
                                {(f.severity ?? '') === "fault" ? "FAULT" : "WARN"}
                            </span>
                        </div>
                    ))
                )}
            </div>
                </>
            )}
        </div>
    )
}
