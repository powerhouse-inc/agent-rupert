/**
 * Timing constants for integration tests
 * 
 * These constants ensure consistent and reliable timing across all integration tests.
 * All times are in milliseconds.
 */

// === Fixture Timing Constants ===
// These match the delays in our test fixtures

/** Time for a service to output its first log line */
export const FIXTURE_INITIAL_OUTPUT_DELAY = 50;

/** Time between sequential readiness patterns in multi-pattern services */
export const FIXTURE_PATTERN_INTERVAL = 50;

/** Total time for a "fast" service to become ready (powerhouse mode) */
export const FIXTURE_FAST_BOOT_TIME = 300;

/** Time for each boot progress step in slow-boot mode (20% increments) */
export const FIXTURE_SLOW_BOOT_STEP = 500;

/** Total time for a "slow" service to become ready */
export const FIXTURE_SLOW_BOOT_TIME = FIXTURE_SLOW_BOOT_STEP * 5; // 2500ms

/** Delay for port release in delayed-release mode */
export const FIXTURE_DELAYED_PORT_RELEASE = 500;

/** Time for graceful shutdown to complete */
export const FIXTURE_GRACEFUL_SHUTDOWN_TIME = 100;

// === Test Timing Constants ===
// These are used in tests to wait for various conditions

/** Extra buffer time to ensure fixture delays have completed */
export const TEST_TIMING_BUFFER = 50;

/** Time to wait for a service to stabilize after starting */
export const SERVICE_STABILIZATION_TIME = 100;

/** Time to wait for process cleanup after stop/kill */
export const PROCESS_CLEANUP_TIME = 200;

/** Time to wait for port release verification to complete */
export const PORT_RELEASE_CHECK_TIME = 1000;

/** Maximum time to wait for a condition in waitFor() */
export const WAIT_FOR_TIMEOUT = 3000;

/** Default timeout for readiness patterns */
export const DEFAULT_READINESS_TIMEOUT = 1000;

/** Extended timeout for slow readiness patterns */
export const EXTENDED_READINESS_TIMEOUT = 5000;

/** Jest test timeout for standard tests */
export const STANDARD_TEST_TIMEOUT = 10000;

/** Jest test timeout for extended tests */
export const EXTENDED_TEST_TIMEOUT = 15000;

// === Calculated Wait Times ===
// These combine fixture and test timings for specific scenarios

/** Time to wait for a fast-booting service to be ready */
export const WAIT_FOR_FAST_READY = FIXTURE_FAST_BOOT_TIME + TEST_TIMING_BUFFER;

/** Time to wait for a slow-booting service to be ready */
export const WAIT_FOR_SLOW_READY = FIXTURE_SLOW_BOOT_TIME + TEST_TIMING_BUFFER;

/** Time to wait after SIGTERM for graceful shutdown */
export const WAIT_FOR_GRACEFUL_SHUTDOWN = FIXTURE_GRACEFUL_SHUTDOWN_TIME + PROCESS_CLEANUP_TIME;

/** Time to wait for delayed port release */
export const WAIT_FOR_DELAYED_PORT_RELEASE = FIXTURE_DELAYED_PORT_RELEASE + PORT_RELEASE_CHECK_TIME;

/** Time to wait for multi-pattern readiness (4 patterns) */
export const WAIT_FOR_MULTI_PATTERN_READY = FIXTURE_PATTERN_INTERVAL * 4 + TEST_TIMING_BUFFER;