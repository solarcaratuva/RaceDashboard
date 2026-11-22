/**
 * Primitive signal values are the JSON-safe values emitted by the backend's
 * DBC decoder. Keeping this type broad lets the UI render signals from every
 * DBC without needing to duplicate each DBC's schema in TypeScript.
 */
export type CanSignalValue = string | number | boolean | null;

/** Latest decoded values for one CAN message, identified by its DBC name and ID. */
export type CanMessageSignals = {
  id: string;
  messageName: string;
  /** Capture time in seconds from the beginning of the log/replay. */
  timestamp: number;
  signals: Record<string, CanSignalValue>;
};

/** Existing dashboard areas that own different families of CAN messages. */
export type CanGroupName = 'primary' | 'bps' | 'motor' | 'diagnostics';

/** CAN messages grouped for rendering inside the existing dashboard cards. */
export type CanDashboardGroups = Record<CanGroupName, CanMessageSignals[]>;

/** A single BPS state-of-charge sample used by the live SoC chart. */
export type SocPoint = {
  timestamp: number;
  soc: number;
};

/** The shared signal renderer only needs the messages owned by one card. */
type CanSignalGroupsProps = {
  messages: CanMessageSignals[];
};

/** Make DBC snake_case signal names easier to read without renaming them. */
function formatSignalName(name: string): string {
  return name.replaceAll('_', ' ');
}

/**
 * Render supported DBC primitives as readable text. The decoder may return
 * null for an unavailable value; booleans are displayed explicitly.
 */
function formatSignalValue(value: string | number | boolean | null): string {
  if (value === null) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  return String(value);
}

/**
 * Render each message and all of its decoded fields inside its owning card.
 * The component intentionally does not filter fields, so signals added to a
 * DBC are visible without adding corresponding frontend properties.
 */
export default function CanSignalGroups({ messages }: CanSignalGroupsProps) {
  if (messages.length === 0) {
    // An empty group is normal until a message in this card's DBC family arrives.
    return <div className="can-signals-empty">Waiting for decoded CAN signals...</div>;
  }

  return (
    <div className="can-signal-groups">
      {messages.map((message) => (
        <section className="can-signal-group" key={`${message.id}-${message.messageName}`}>
          <h5>
            {message.messageName}
            {/* Include the frame ID so similarly named messages are distinguishable. */}
            <span>{message.id}</span>
          </h5>
          <dl>
            {Object.entries(message.signals).map(([name, value]) => (
              <div className="can-signal-row" key={name}>
                <dt>{formatSignalName(name)}</dt>
                <dd>{formatSignalValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
