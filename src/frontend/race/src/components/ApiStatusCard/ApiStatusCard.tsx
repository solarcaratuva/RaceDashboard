import { useState, useEffect } from 'react';
import axios from 'axios';
import io, { Socket } from "socket.io-client";

type ApiStatusCardProps = {
  apiUrl?: string;
};

const ApiStatusCard = ({ apiUrl = '/api/test' }: ApiStatusCardProps) => {
  const [status, setStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [responseTime, setResponseTime] = useState<number | null>(null);

    //initalize socket io connection
    const socket:  Socket = io("http://localhost:5173")

  const checkApiStatus = async () => {
    setStatus('checking');
    const startTime = performance.now();

    try {
      const response = await axios.get(apiUrl, {
        timeout: 5000,
        validateStatus: (status) => status < 500,
      });
    
      // Fired when connected successfully
      socket.on("connect", () => {
        setStatus('online');
        socket.disconnect(); // disconnect immediately after checking
      });

      // if connection fails or disconnects immediately
      socket.on("connect_error", () => setStatus('offline'));
      socket.on("connect_timeout", () => setStatus('offline'));
      

      const endTime = performance.now();
      const timeElapsed = Math.round(endTime - startTime);
      
      if (response.status >= 200 && response.status < 300) {
        setStatus('online');
        setResponseTime(timeElapsed);
      } else {
        setStatus('offline');
        setResponseTime(null);
      }
      
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('API Check Error:', error.message);
      }
      setStatus('offline');
      setResponseTime(null);
    }
  };

  useEffect(() => {
    checkApiStatus();
    const interval = setInterval(checkApiStatus, 30000);
    
    return () => {
      clearInterval(interval); 
      socket.disconnect();
    };
  }, [apiUrl]);

  const openApiStatusPage = () => {
    window.open(apiUrl, '_blank');
  };

  return (
    <div className="api-status-card">
      <div className="api-status-header">
        <h3>API Status</h3>
        <div className={`status-dot ${status}`}></div>
      </div>

      <div className="api-status-content">
        <div className="status-info">
          <span className="status-label">Status:</span>
          <span className={`status-value ${status}`}>
            {status === 'online' && 'Online'}
            {status === 'offline' && 'Offline'}
            {status === 'checking' && 'Checking...'}
          </span>
        </div>

        {responseTime !== null && (
          <div className="status-info">
            <span className="status-label">Response:</span>
            <span className="status-value">{responseTime}ms</span>
          </div>
        )}

        <div className="status-info">
        </div>
      </div>

      <div className="api-status-actions">
        <button className="api-test-button" onClick={openApiStatusPage}>
          View Details
        </button>
        <button className="api-refresh-button" onClick={checkApiStatus}>
          Refresh
        </button>
      </div>
    </div>
  );
};

export default ApiStatusCard;