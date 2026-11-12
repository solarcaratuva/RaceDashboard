import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Label } from 'recharts';
import './BpsSocGraphCard.css'
import type { SocPoint } from '../CanSignalGroups/CanSignalGroups';


type BpsSocGraphCardProps = {
  /** BPS SoC samples from BpsStatus frames; absent outside XBee mode. */
  data?: SocPoint[];
};

function BpsSocGraphCard({ data = [] }: BpsSocGraphCardProps) {
    // Recharts receives compact string labels while retaining each decoded SoC value.
    const chartData = data.map(({ timestamp, soc }) => ({
        time: timestamp.toFixed(1),
        soc,
    }));

    return (
        <div className="card">
            <h3 className="card-title">BPS SoC Over Time</h3>
            {/* Do not invent sample values: an empty chart means no BpsStatus
                message containing a numeric pack_soc has arrived yet. */}
            {chartData.length === 0 ? (
              <div>No BPS state-of-charge samples received yet.</div>
            ) : <AreaChart
            style={{ width: '100%', maxWidth: '700px', maxHeight: '70vh', aspectRatio: 1.618, }}
            responsive
            data={chartData}
            margin={{
                top: 20,
                right: 0,
                left: 0,
                bottom: 20,
            }}
            >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis  dataKey="time" stroke="#ffffff">
                <Label
                    value="Time"
                    position="insideBottom"
                    offset={-15}   
                    style={{ fill: "#ffffff", fontSize: 12 }}
                />
            </XAxis>
            <YAxis
                stroke="#ffffff"
                tick={{ fill: "#ffffff", fontSize: 12 }}
                >
                <Label
                    value="State of Charge (%)"
                    angle={-90}      
                    position="insideLeft"
                    style={{ fill: "#ffffff", fontSize: 12 }}
                />
                </YAxis>
            <Tooltip />
            <Area type="monotone" dataKey="soc" stroke="#8884d8" fill="#8884d8" />
            </AreaChart>}
        </div>
    
  );
}

export default BpsSocGraphCard;