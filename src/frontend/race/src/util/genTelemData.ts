type SpeedData = {
  max: number;
  min: number;
  average: number;
  current: number;
};

type MotorCommands = {
  breaking: boolean;
  cruise: boolean;
  manual: boolean;
  throttlePedal: number;
  brakePedal: number;
  throttle: number;
  motorRPM: number;
};

type CanValues = {
  motorTemp: number;
  current: number;
};

type Heartbeat = {
  board1: boolean;
  board2: boolean;
};

type Wheelboard = {
  hazards: boolean;
  turnSignal: "Left" | "Right" | "Off";
};

type GpsData = {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number;
  speed: number;
};

type ImuData = {
  accelX: number;
  accelY: number;
  accelZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  roll: number;
  pitch: number;
  yaw: number;
};

type GraphPoint = {
  timestamp: number;
  speed: number;
  motorTemp: number;
  current: number;
};

type AllTelemetry = {
  speed: SpeedData;
  motorCommands: MotorCommands;
  canValues: CanValues;
  errors: string[];
  heartbeat: Heartbeat;
  lteStatus: { lastMessageSec: number };
  wheelboard: Wheelboard;
  gps: GpsData;
  imu: ImuData;
  graphData: GraphPoint[];
};

export const generateSpeedData = (): SpeedData => {
  const max = Math.floor(Math.random() * 50) + 30;
  const min = Math.floor(Math.random() * 30);
  const average = Math.floor((max + min) / 2);
  const current = average + Math.floor(Math.random() * 5);

  return { max, min, average, current };
};

export const generateMotorCommands = (): MotorCommands => {
  const breaking = Math.random() > 0.7;
  const cruise = Math.random() > 0.5;
  const manual = !cruise;

  const brakePedal = breaking
    ? Math.floor(Math.random() * 60) + 40
    : Math.floor(Math.random() * 40);
  const throttlePedal = breaking
    ? 0
    : Math.floor(Math.random() * 80) + 20;
  const motorRPM = breaking
    ? Math.floor(Math.random() * 2000) + 1000
    : Math.floor(Math.random() * 4000) + 2000;
  const throttle = breaking
    ? 0
    : Math.floor(Math.random() * 70) + 30;

  return { breaking, cruise, manual, throttlePedal, brakePedal, throttle, motorRPM };
};

export const generateCanValues = (): CanValues => ({
  motorTemp: 80 + Math.floor(Math.random() * 10),
  current: 50 + Math.floor(Math.random() * 20),
});

export const generateErrors = (): string[] => {
  const possibleErrors = [
    "Motor Overheat",
    "Battery Low",
    "Connection Lost",
    "Sensor Fault",
    "System Error",
  ];

  if (Math.random() <= 0.9) {
    return [];
  }

  const randomIndex = Math.floor(Math.random() * possibleErrors.length);
  return [possibleErrors[randomIndex] ?? "Sensor Fault"];
};

export const generateHeartbeat = (): Heartbeat => ({
  board1: Math.random() > 0.1,
  board2: Math.random() > 0.1,
});

export const generateLteStatus = (): { lastMessageSec: number } => ({
  lastMessageSec: Math.floor(Math.random() * 10),
});

export const generateWheelboard = (): Wheelboard => {
  const turnSignals: Wheelboard["turnSignal"][] = ["Left", "Right", "Off"];
  const randomIndex = Math.floor(Math.random() * turnSignals.length);

  return {
    hazards: Math.random() > 0.8,
    turnSignal: turnSignals[randomIndex] ?? "Off",
  };
};

export const generateGpsData = (): GpsData => ({
  latitude: 38.0293 + (Math.random() - 0.5) * 0.01,
  longitude: -78.4767 + (Math.random() - 0.5) * 0.01,
  altitude: 200 + Math.floor(Math.random() * 50),
  accuracy: Math.floor(Math.random() * 5) + 1,
  speed: Math.floor(Math.random() * 120),
});

export const generateImuData = (): ImuData => ({
  accelX: (Math.random() - 0.5) * 2,
  accelY: (Math.random() - 0.5) * 2,
  accelZ: (Math.random() - 0.5) * 0.5 + 0.98,
  gyroX: (Math.random() - 0.5) * 10,
  gyroY: (Math.random() - 0.5) * 10,
  gyroZ: (Math.random() - 0.5) * 10,
  roll: (Math.random() - 0.5) * 45,
  pitch: (Math.random() - 0.5) * 45,
  yaw: Math.random() * 360,
});

export const generateGraphData = (points = 30): GraphPoint[] => {
  const data: GraphPoint[] = [];
  let speed = 30;

  for (let index = 0; index < points; index += 1) {
    speed = Math.max(0, Math.min(120, speed + (Math.random() - 0.5) * 10));
    data.push({
      timestamp: index,
      speed: Math.round(speed),
      motorTemp: 80 + Math.floor(Math.random() * 10),
      current: 50 + Math.floor(Math.random() * 20),
    });
  }

  return data;
};

export const generateAllTelemetry = (): AllTelemetry => ({
  speed: generateSpeedData(),
  motorCommands: generateMotorCommands(),
  canValues: generateCanValues(),
  errors: generateErrors(),
  heartbeat: generateHeartbeat(),
  lteStatus: generateLteStatus(),
  wheelboard: generateWheelboard(),
  gps: generateGpsData(),
  imu: generateImuData(),
  graphData: generateGraphData(),
});

export default generateAllTelemetry;