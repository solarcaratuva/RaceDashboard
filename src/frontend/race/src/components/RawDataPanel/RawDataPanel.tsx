import './RawDataPanel.css';

type BackendSource = 'cloud' | 'xbee' | 'legacy' | 'unknown';

type RawDataPanelProps = {
  backendSource: BackendSource;
  entries: {
    id: string;
    source: BackendSource;
    timestamp: number;
    rawData: string;
    messageName: string | null;
    signals: Record<string, any> | null;
    original: any;
  }[];
};

const RawDataPanel = ({ backendSource, entries }: RawDataPanelProps) => {
  return (
    <div className="raw-data-panel card-secondary">
      <div className="raw-data-header">
        <h2>Backend Stream</h2>
        <span>Source: {backendSource}</span>
      </div>
      <div className="raw-data-list">
        {entries.length === 0 ? (
          <div className="raw-data-empty">Waiting for live backend data...</div>
        ) : (
          entries.map((entry, index) => (
            <div key={`${entry.source}-${index}`} className="raw-data-item">
              <div className="raw-data-meta">
                <span>{entry.source.toUpperCase()}</span>
                <span>{entry.messageName || 'no name'}</span>
              </div>
              <pre>{entry.rawData}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RawDataPanel;
