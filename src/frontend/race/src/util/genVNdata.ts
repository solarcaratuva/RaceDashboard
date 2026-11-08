// File Purpose: Generates random VN-200 data to test display on React Dashboard
// File Structure: simulation (hashmap) gives starting values that are randomly updated whenever
    // advanceSimulation() is ran but is kept inside a realstic range with the clamp() method
// GPT 5.6 was used to create starting vals and determine what ranges are 'realstic' for 
    //the VN-200 values

type VnData = Record<string, number>;

// These values are deliberately simple. Each call is one fake VN-200/CAN sample.
// The starting location is only a convenient point near a possible race route.
const simulation = {
    latitude: 38.0293,
    longitude: -78.4767,
    altitude: 210,
    speed: 16,
    heading: 92,
    roll: 0,
    pitch: 1.2,
    velocityNorth: 8,
    velocityEast: 13,
    sequence: 0,
};

// Return a random number between the two limits. This gives sensor readings
// small changes instead of producing the same value on every CAN message.
const randomBetween = (minimum: number, maximum: number) =>
    minimum + Math.random() * (maximum - minimum);

// Keep a simulated sensor value inside a realistic operating range.
const clamp = (value: number, minimum: number, maximum: number) =>
    Math.max(minimum, Math.min(maximum, value));

// Update the car once before a sample is created. The small random changes
// imitate a car driving around a track without modeling a complete vehicle.
const advanceSimulation = () => {
    simulation.speed = clamp(simulation.speed + randomBetween(-0.4, 0.4), 0, 24);
    simulation.heading = (simulation.heading + randomBetween(-1, 1) + 360) % 360;
    simulation.roll = clamp(simulation.roll + randomBetween(-0.2, 0.2), -4, 4);
    simulation.pitch = clamp(simulation.pitch + randomBetween(-0.15, 0.15), -3, 4);
    simulation.altitude = clamp(simulation.altitude + randomBetween(-0.05, 0.05), 205, 215);

    // These are meters per second in the north, east, and down directions.
    simulation.velocityNorth = clamp(simulation.velocityNorth + randomBetween(-0.2, 0.2), -24, 24);
    simulation.velocityEast = clamp(simulation.velocityEast + randomBetween(-0.2, 0.2), -24, 24);

    // Roughly convert a small movement in meters into latitude/longitude.
    // The approximation is sufficient for dashboard demo data.
    simulation.latitude += simulation.velocityNorth / 111_320 / 10;
    simulation.longitude += simulation.velocityEast / 88_000 / 10;
    simulation.sequence += 1;
};

// Attitude is expressed in degrees. Yaw is the car's compass heading.
const createAttitude = (): VnData => ({
    roll: simulation.roll,
    yaw: simulation.heading,
    pitch: simulation.pitch,
    sequence: simulation.sequence,
});

// Angular rate is expressed in degrees per second. A moving car turns mostly
// around its vertical axis, so gyro_z has slightly more variation.
const createAngularRate = (): VnData => ({
    gyro_x: randomBetween(-0.08, 0.08),
    gyro_y: randomBetween(-0.08, 0.08),
    gyro_z: randomBetween(-0.35, 0.35),
    sequence: simulation.sequence,
});

// Acceleration is expressed in meters per second squared. The Z axis includes
// Earth's gravity, which is why a stationary sensor reads close to 9.81.
const createAcceleration = (): VnData => ({
    accel_x: randomBetween(-0.015, 0.015),
    accel_y: randomBetween(-0.02, 0.02),
    accel_z: randomBetween(9.78, 9.83),
    sequence: simulation.sequence,
});

// GPS position is expressed in decimal degrees. Tiny noise represents normal
// GNSS jitter around the car's estimated position.
const createPosition = (): VnData => ({
    latitude: simulation.latitude + randomBetween(-0.000002, 0.000002),
    longitude: simulation.longitude + randomBetween(-0.000002, 0.000002),
});

// VN-200 velocity uses north/east/down components in meters per second.
// A fix value of 3 represents a normal 3D GNSS fix.
const createVelocity = (): VnData => ({
    vel_n: simulation.velocityNorth,
    vel_e: simulation.velocityEast,
    vel_d: randomBetween(-0.02, 0.02),
    num_sats: 11,
    gnss_fix: 3,
});

// These status values represent a healthy, synchronized navigation solution.
const createStatus = (): VnData => ({
    altitude: simulation.altitude,
    ins_status: 1,
    time_status: 2,
    sequence: simulation.sequence,
});

export const generateAttitude = (): VnData => {
    advanceSimulation();
    return createAttitude();
};

export const generateAngularRate = (): VnData => {
    advanceSimulation();
    return createAngularRate();
};

export const generateAcceleration = (): VnData => {
    advanceSimulation();
    return createAcceleration();
};

export const generatePosition = (): VnData => {
    advanceSimulation();
    return createPosition();
};

export const generateVelocity = (): VnData => {
    advanceSimulation();
    return createVelocity();
};

export const generateStatus = (): VnData => {
    advanceSimulation();
    return createStatus();
};

export const generate_all_vn_data = (): Record<string, VnData> => {
    // Advance once so every field below belongs to the same simulated CAN
    // message rather than representing six different moments in time.
    advanceSimulation();

    return {
        attitude: createAttitude(),
        angularRate: createAngularRate(),
        acceleration: createAcceleration(),
        position: createPosition(),
        velocity: createVelocity(),
        status: createStatus(),
    };
};