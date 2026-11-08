import "./MotorCard.css";
import CanSignalGroups from "../CanSignalGroups/CanSignalGroups";
import type { CanMessageSignals } from "../CanSignalGroups/CanSignalGroups";

/** Legacy motor properties are kept for the non-XBee dashboard path. */
type Motor = {
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

type MotorCardProps = {
  motor: Motor;
  /** Motor-controller DBC frames received through the XBee stream. */
  canMessages?: CanMessageSignals[];
}

export default function MotorCard({motor, canMessages} : MotorCardProps) {
  return (
    <div className="secondary-block">
        <h4 className="block-label">Motor</h4>

        {/* Render all motor-controller messages in XBee mode, including controller
            status/error signals that did not have fields in the legacy Motor type. */}
        {canMessages !== undefined ? (
          <CanSignalGroups messages={canMessages} />
        ) : (
          <>
        <div className="secondary-row">
          <span>Motor RPM</span>
          <span className="secondary-value">
              {motor?.motorRpm ?? 0} rpm
          </span>
        </div>

        <div className="secondary-row">
          <span>Motor Current</span>
          <span className="secondary-value">
              {motor?.motorCurrent ?? 0} A
          </span>
        </div>

        <div className="secondary-row">
          <span>Battery V (MC)</span>
          <span className="secondary-value">
              {motor?.batteryVoltage ?? 0} V
          </span>
        </div>

        <div className="secondary-row">
          <span>Battery I (MC)</span>
          <span className="secondary-value">
              {motor?.batteryCurrent ?? 0} A
          </span>
        </div>

        <div className="secondary-row">
          <span>FET Temp</span>
          <span className="secondary-value">
              {motor?.fetTemp ?? 0} °C
          </span>
        </div>

        <div className="secondary-row">
          <span>PWM Duty</span>
          <span className="secondary-value">
              {motor?.pwmDuty ?? 0} %
          </span>
        </div>

        <div className="secondary-row">
          <span>Accel Position</span>
          <span className="secondary-value">
              {motor?.acceleratorPosition ?? 0} %
          </span>
        </div>

        <div className="secondary-row">
          <span>Regen Position</span>
          <span className="secondary-value">
              {motor?.regenPosition ?? 0} %
          </span>
        </div>

        <div className="secondary-row">
          <span>Power Mode</span>
          <span className="secondary-value">
              {motor?.powerMode ?? 'STANDBY'}
          </span>
        </div>

        <div className="secondary-row">
          <span>Control Mode</span>
          <span className="secondary-value">
              {motor?.controlMode ?? 'TORQUE'}
          </span>
        </div>

        <div className="secondary-row">
          <span>Regen</span>
          <span className="secondary-value">
              {String(motor?.regenEnabled ?? false)}
          </span>
        </div>
          </>
        )}
    </div>
  );
}